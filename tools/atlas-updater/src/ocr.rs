//! Offline text recognition (OCR) for pages that the extension sends to the helper.
//!
//! The engine is PP-OCRv4 (PaddleOCR, Apache-2.0), in the ONNX form that RapidOCR (Apache-2.0) ships on PyPI. The
//! helper downloads that wheel, checks its SHA-256 and takes two models out of it: the text detector and the text
//! recogniser. The character list is stored inside the recogniser's model file. Inference runs in Rust (tract), so no
//! native library is needed.
//!
//! The steps follow RapidOCR: the detector finds text areas on a probability map, the areas are grouped into lines,
//! and each area is read by the recogniser with greedy CTC decoding.
//!
//! The second engine is ocrs (Robert Knight, MIT or Apache-2.0), in pure Rust, with its .rten models (CC BY-SA 4.0).
//! Its two models are downloaded from a GitHub mirror at a fixed commit and checked by size and SHA-256. The engine is
//! chosen per request: the one asked for when it is installed, otherwise the other installed one.
//!
//! Limits of this first version: text is read as horizontal lines. There is no rotated-text or 180-degree correction
//! (the wheel's direction classifier is not used), and a detected area is its axis-aligned box, not a tilted rectangle.

use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Mutex;

use image::imageops::{self, FilterType};
use image::RgbImage;
use tract_onnx::prelude::*;

use crate::json;
use crate::sha256;
use crate::transfer::Transfer;

/// The RapidOCR 1.4.4 wheel on PyPI (Apache-2.0). The digest is the one PyPI publishes for the file.
pub const WHEEL_URL: &str = "https://files.pythonhosted.org/packages/ba/12/1e5497183bdbe782dbb91bad1d0d2297dba4d2831b2652657f7517bfc6df/rapidocr_onnxruntime-1.4.4-py3-none-any.whl";
pub const WHEEL_BYTES: u64 = 14_915_192;
pub const WHEEL_SHA256: &str = "971d7d5f223a7a808662229df1ef69893809d8457d834e6373d3854bc1782cbf";

const DET_IN_WHEEL: &str = "rapidocr_onnxruntime/models/ch_PP-OCRv4_det_infer.onnx";
const REC_IN_WHEEL: &str = "rapidocr_onnxruntime/models/ch_PP-OCRv4_rec_infer.onnx";
const DET_FILE: &str = "ch_PP-OCRv4_det_infer.onnx";
const REC_FILE: &str = "ch_PP-OCRv4_rec_infer.onnx";
const MARKER: &str = "installed.json";

/// The detector works on pictures whose shorter side is at least this long (RapidOCR's limit), and at most MAX_SIDE.
const LIMIT_SIDE: f32 = 736.0;
const MAX_SIDE: f32 = 1536.0;
const PIXEL_THRESH: f32 = 0.3;
const BOX_THRESH: f32 = 0.5;
const UNCLIP_RATIO: f32 = 1.6;
const MAX_AREAS: usize = 1000;

/// The recogniser reads text rows of this height, padded to a multiple of WIDTH_STEP (at least REC_MIN_W wide).
const REC_H: u32 = 48;
const REC_MIN_W: u32 = 320;
const WIDTH_STEP: u32 = 64;

/// A line of recognised text and its box, in pixels of the picture that was read.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub text: String,
    pub bbox: [u32; 4],
}

pub fn dir(root: &Path) -> PathBuf {
    root.join("ocr")
}

/// True when both models and the install marker are in place.
pub fn installed(root: &Path) -> bool {
    let d = dir(root);
    d.join(MARKER).is_file() && d.join(DET_FILE).is_file() && d.join(REC_FILE).is_file()
}

/// The engine names used by the extension and the helper. ocrs is the default (confirmed by the maintainer);
/// PP-OCRv4 can still be installed and is used when it is the only engine installed.
pub const ENGINE_PPOCR: &str = "ppocr";
pub const ENGINE_OCRS: &str = "ocrs";

// ocrs: two .rten models. The original host no longer answers, so they come from a GitHub mirror at a fixed commit.
// The same SHA-256 values are published by two other mirrors. Model licence: CC BY-SA 4.0 (see NOTICE.md).
const OCRS_BASE: &str = "https://github.com/baras-app/ocr-models/raw/2854720fdf7218273b85010d49302765476e16fc/";
const OCRS_DIR: &str = "ocrs";
const OCRS_FILES: [(&str, u64, &str); 2] = [
    ("text-detection.rten", 2_510_284, "f15cfb56bd02c4bf478a20343986504a1f01e1665c2b3a0ad66340f054b1b5ca"),
    ("text-recognition.rten", 9_716_568, "e484866d4cce403175bd8d00b128feb08ab42e208de30e42cd9889d8f1735a6e"),
];

/// The folder of the ocrs models, inside the OCR folder.
pub fn ocrs_dir(root: &Path) -> PathBuf {
    dir(root).join(OCRS_DIR)
}

/// True when both ocrs models and the install marker are in place.
pub fn ocrs_installed(root: &Path) -> bool {
    let d = ocrs_dir(root);
    d.join(MARKER).is_file() && OCRS_FILES.iter().all(|file| d.join(file.0).is_file())
}

/// The engines whose models are installed, PP-OCRv4 first.
pub fn installed_engines(root: &Path) -> Vec<&'static str> {
    let mut list = Vec::new();
    if installed(root) {
        list.push(ENGINE_PPOCR);
    }
    if ocrs_installed(root) {
        list.push(ENGINE_OCRS);
    }
    list
}

/// The engine that reads a picture: the one asked for when it is installed, otherwise the other installed one.
/// None when no engine is installed.
pub fn engine_for(root: &Path, requested: &str) -> Option<&'static str> {
    let installed = installed_engines(root);
    let wanted = if requested == ENGINE_PPOCR { ENGINE_PPOCR } else { ENGINE_OCRS };
    if installed.contains(&wanted) {
        return Some(wanted);
    }
    installed.first().copied()
}

/// Downloads the two ocrs models, checks each size and SHA-256, and keeps them only when both pass.
pub fn install_ocrs(root: &Path, transfer: &Transfer) -> Result<(), String> {
    let d = ocrs_dir(root);
    fs::create_dir_all(&d).map_err(|e| format!("cannot create {}: {}", d.display(), e))?;
    let _ = fs::remove_file(d.join(MARKER));
    let total: u64 = OCRS_FILES.iter().map(|file| file.1).sum();
    transfer.progress.total.store(total, Ordering::Relaxed);
    for (name, bytes, sha) in OCRS_FILES {
        let part = d.join(format!("{}.part", name));
        if let Err(e) = transfer.download(&format!("{}{}", OCRS_BASE, name), &part, Some(bytes)) {
            let _ = fs::remove_file(&part);
            return Err(format!("the {} model could not be downloaded: {}", name, e));
        }
        let data = fs::read(&part).map_err(|e| format!("cannot read {}: {}", part.display(), e))?;
        let _ = fs::remove_file(&part);
        if data.len() as u64 != bytes {
            return Err(format!("{} is {} bytes, expected {}. Nothing was installed.", name, data.len(), bytes));
        }
        if sha256::hex(&data) != sha {
            return Err(format!("the SHA-256 check of {} failed. Nothing was installed.", name));
        }
        write_file(&d.join(name), &data)?;
    }
    fs::write(d.join(MARKER), format!("{{\"source\":{}}}\n", json::quote(OCRS_BASE)))
        .map_err(|e| format!("cannot finish the install: {}", e))
}

/// Downloads the wheel, checks its size and SHA-256, and keeps the two models. Nothing is kept if a check fails.
pub fn install(root: &Path, transfer: &Transfer) -> Result<(), String> {
    let d = dir(root);
    fs::create_dir_all(&d).map_err(|e| format!("cannot create {}: {}", d.display(), e))?;
    transfer.progress.total.store(WHEEL_BYTES, Ordering::Relaxed);
    let _ = fs::remove_file(d.join(MARKER));

    let part = d.join("rapidocr.whl.part");
    if let Err(e) = transfer.download(WHEEL_URL, &part, Some(WHEEL_BYTES)) {
        let _ = fs::remove_file(&part);
        return Err(format!("the text recognition models could not be downloaded: {}", e));
    }
    let wheel = fs::read(&part).map_err(|e| format!("cannot read {}: {}", part.display(), e))?;
    let _ = fs::remove_file(&part);
    if wheel.len() as u64 != WHEEL_BYTES {
        return Err(format!(
            "the text recognition models are {} bytes, expected {}. Nothing was installed.",
            wheel.len(),
            WHEEL_BYTES
        ));
    }
    if sha256::hex(&wheel) != WHEEL_SHA256 {
        return Err("the SHA-256 check of the text recognition models failed. Nothing was installed.".to_string());
    }

    let det = plain_dimension_names(&entry(&wheel, DET_IN_WHEEL)?);
    let rec = plain_dimension_names(&entry(&wheel, REC_IN_WHEEL)?);
    write_file(&d.join(DET_FILE), &det)?;
    write_file(&d.join(REC_FILE), &rec)?;
    let marker = format!(
        "{{\"wheel\":{},\"sha256\":{}}}\n",
        json::quote(WHEEL_URL),
        json::quote(WHEEL_SHA256)
    );
    fs::write(d.join(MARKER), marker).map_err(|e| format!("cannot finish the install: {}", e))
}

fn entry(wheel: &[u8], name: &str) -> Result<Vec<u8>, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(wheel))
        .map_err(|e| format!("the models package cannot be read: {}", e))?;
    let mut file = zip
        .by_name(name)
        .map_err(|_| format!("{} is missing from the models package", name))?;
    let mut out = Vec::new();
    file.read_to_end(&mut out)
        .map_err(|e| format!("cannot unpack {}: {}", name, e))?;
    Ok(out)
}

/// PaddleOCR exports name the dynamic input sizes "p2o.DynamicDimension.N", and tract refuses the dots in those
/// names when it reads the model. Each dot is replaced by an underscore. The names have the same length, so the
/// protobuf lengths in the file stay valid, and the names carry no meaning otherwise.
pub fn plain_dimension_names(model: &[u8]) -> Vec<u8> {
    const FROM: &[u8] = b"p2o.DynamicDimension.";
    const TO: &[u8] = b"p2o_DynamicDimension_";
    let mut out = model.to_vec();
    let mut i = 0;
    while i + FROM.len() <= out.len() {
        if out[i..i + FROM.len()] == *FROM {
            out[i..i + FROM.len()].copy_from_slice(TO);
            i += FROM.len();
        } else {
            i += 1;
        }
    }
    out
}

fn write_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("part");
    fs::write(&tmp, bytes).map_err(|e| format!("cannot write {}: {}", tmp.display(), e))?;
    fs::rename(&tmp, path).map_err(|e| format!("cannot finish {}: {}", path.display(), e))
}

/// Reads one string entry of an ONNX model's metadata from the file's bytes. Each entry is a protobuf message whose
/// key (field 1) is written before its value (field 2), so the key and the value's length prefix are searched for.
pub fn metadata_text(model: &[u8], key: &str) -> Option<String> {
    if key.len() >= 128 {
        return None;
    }
    let mut pattern = vec![0x0a, key.len() as u8];
    pattern.extend_from_slice(key.as_bytes());
    pattern.push(0x12);
    let at = model.windows(pattern.len()).position(|w| w == pattern.as_slice())?;
    let mut pos = at + pattern.len();
    let (len, used) = read_varint(&model[pos..])?;
    pos += used;
    let value = model.get(pos..pos.checked_add(len)?)?;
    String::from_utf8(value.to_vec()).ok()
}

fn read_varint(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut value: usize = 0;
    for (i, b) in bytes.iter().enumerate().take(5) {
        value |= ((b & 0x7f) as usize) << (7 * i);
        if b & 0x80 == 0 {
            return Some((value, i + 1));
        }
    }
    None
}

type Plan = TypedRunnableModel<TypedModel>;

fn compile(path: &Path, shape: TVec<usize>) -> Result<Plan, String> {
    let model = tract_onnx::onnx()
        .model_for_path(path)
        .map_err(|e| format!("cannot load {}: {}", path.display(), e))?
        .with_input_fact(0, InferenceFact::dt_shape(f32::datum_type(), shape))
        .map_err(|e| format!("cannot set the input of {}: {}", path.display(), e))?
        .into_optimized()
        .map_err(|e| format!("cannot optimise {}: {}", path.display(), e))?
        .into_runnable()
        .map_err(|e| format!("cannot prepare {}: {}", path.display(), e))?;
    Ok(model)
}

/// Runs a plan on one NCHW float input. Returns the output's shape and values.
fn run(plan: &Plan, data: &[f32], shape: &[usize]) -> Result<(Vec<usize>, Vec<f32>), String> {
    let input = Tensor::from_shape(shape, data).map_err(|e| format!("bad input shape: {}", e))?;
    let out = plan.run(tvec!(input.into())).map_err(|e| format!("recognition failed: {}", e))?;
    let first = &out[0];
    let values = first
        .as_slice::<f32>()
        .map_err(|e| format!("bad model output: {}", e))?
        .to_vec();
    Ok((first.shape().to_vec(), values))
}

/// The loaded models. The plans are compiled once per input size, so a page of the same size reuses them.
pub struct Engine {
    det_path: PathBuf,
    rec_path: PathBuf,
    chars: Vec<String>,
    det_plans: HashMap<(usize, usize), Plan>,
    rec_plans: HashMap<u32, Plan>,
}

impl Engine {
    pub fn load(dir: &Path) -> Result<Engine, String> {
        let det_path = dir.join(DET_FILE);
        let rec_path = dir.join(REC_FILE);
        let rec_bytes = fs::read(&rec_path).map_err(|e| format!("cannot read {}: {}", rec_path.display(), e))?;
        let listed = metadata_text(&rec_bytes, "character")
            .ok_or_else(|| "the recogniser model has no character list".to_string())?;
        // Index 0 is the CTC blank, the last index is the space (RapidOCR's layout).
        let mut chars = vec!["blank".to_string()];
        chars.extend(listed.split('\n').map(|c| c.to_string()));
        chars.push(" ".to_string());
        Ok(Engine {
            det_path,
            rec_path,
            chars,
            det_plans: HashMap::new(),
            rec_plans: HashMap::new(),
        })
    }

    /// Reads every line of text on the picture, in reading order (top to bottom, then left to right).
    pub fn read_page(&mut self, img: &RgbImage) -> Result<Vec<Line>, String> {
        let areas = self.detect(img)?;
        let mut lines = Vec::new();
        for line in group_lines(areas) {
            let mut text = String::new();
            let mut previous_right: Option<f32> = None;
            for part in &line {
                let word = self.read_area(img, *part)?;
                let word = word.trim();
                if word.is_empty() {
                    continue;
                }
                if let Some(right) = previous_right {
                    let height = part[3] - part[1];
                    if part[0] - right >= 0.15 * height {
                        text.push(' ');
                    }
                }
                text.push_str(word);
                previous_right = Some(part[2]);
            }
            if text.is_empty() {
                continue;
            }
            let bbox = line.iter().fold([f32::MAX, f32::MAX, 0.0f32, 0.0f32], |acc, p| {
                [acc[0].min(p[0]), acc[1].min(p[1]), acc[2].max(p[2]), acc[3].max(p[3])]
            });
            lines.push(Line {
                text,
                bbox: [
                    bbox[0].max(0.0) as u32,
                    bbox[1].max(0.0) as u32,
                    bbox[2].max(0.0) as u32,
                    bbox[3].max(0.0) as u32,
                ],
            });
        }
        Ok(lines)
    }

    /// The text areas of the picture, as [x0, y0, x1, y1] in the picture's own pixels.
    fn detect(&mut self, img: &RgbImage) -> Result<Vec<[f32; 4]>, String> {
        let (w0, h0) = img.dimensions();
        let min_side = w0.min(h0) as f32;
        let max_side = w0.max(h0) as f32;
        let mut ratio = 1.0f32;
        if min_side < LIMIT_SIDE {
            ratio = LIMIT_SIDE / min_side;
        }
        if max_side * ratio > MAX_SIDE {
            ratio = MAX_SIDE / max_side;
        }
        // The network needs sides that are multiples of 32.
        let h = (((h0 as f32 * ratio) / 32.0).round() as u32 * 32).max(32);
        let w = (((w0 as f32 * ratio) / 32.0).round() as u32 * 32).max(32);
        let resized = imageops::resize(img, w, h, FilterType::Triangle);

        let plane = (h * w) as usize;
        let mut data = vec![0f32; 3 * plane];
        for (x, y, px) in resized.enumerate_pixels() {
            let i = (y * w + x) as usize;
            for c in 0..3 {
                // The models were trained on BGR pictures (OpenCV's order), so channel 0 is blue.
                data[c * plane + i] = px[2 - c] as f32 / 127.5 - 1.0;
            }
        }
        let shape = [1, 3, h as usize, w as usize];
        if !self.det_plans.contains_key(&(h as usize, w as usize)) {
            let plan = compile(&self.det_path, tvec!(1, 3, h as usize, w as usize))?;
            self.det_plans.insert((h as usize, w as usize), plan);
        }
        let plan = &self.det_plans[&(h as usize, w as usize)];
        let (_, prob) = run(plan, &data, &shape)?;
        Ok(boxes_from_map(
            &prob,
            h as usize,
            w as usize,
            (w as f32 / w0 as f32, h as f32 / h0 as f32),
            (w0, h0),
        ))
    }

    /// Reads one text area of the picture.
    fn read_area(&mut self, img: &RgbImage, area: [f32; 4]) -> Result<String, String> {
        let x0 = area[0].floor().max(0.0) as u32;
        let y0 = area[1].floor().max(0.0) as u32;
        let x1 = (area[2].ceil().max(0.0) as u32).min(img.width());
        let y1 = (area[3].ceil().max(0.0) as u32).min(img.height());
        if x1 <= x0 || y1 <= y0 {
            return Ok(String::new());
        }
        let crop = imageops::crop_imm(img, x0, y0, x1 - x0, y1 - y0).to_image();
        let (cw, ch) = crop.dimensions();
        let scaled_w = ((REC_H as f32 * cw as f32 / ch as f32).ceil() as u32).max(1);
        let bucket = scaled_w.max(REC_MIN_W).div_ceil(WIDTH_STEP) * WIDTH_STEP;
        let resized = imageops::resize(&crop, scaled_w, REC_H, FilterType::Triangle);

        let plane = (REC_H * bucket) as usize;
        let mut data = vec![0f32; 3 * plane];
        for (x, y, px) in resized.enumerate_pixels() {
            let i = (y * bucket + x) as usize;
            for c in 0..3 {
                data[c * plane + i] = px[2 - c] as f32 / 127.5 - 1.0;
            }
        }
        if !self.rec_plans.contains_key(&bucket) {
            let plan = compile(&self.rec_path, tvec!(1, 3, REC_H as usize, bucket as usize))?;
            self.rec_plans.insert(bucket, plan);
        }
        let plan = &self.rec_plans[&bucket];
        let (dims, probs) = run(plan, &data, &[1, 3, REC_H as usize, bucket as usize])?;
        if dims.len() != 3 {
            return Err(format!("unexpected recogniser output shape {:?}", dims));
        }
        Ok(ctc_greedy(&probs, dims[1], dims[2], &self.chars))
    }
}

/// Greedy CTC decoding: take the best class per step, drop repeats and the blank (class 0).
pub fn ctc_greedy(probs: &[f32], steps: usize, classes: usize, chars: &[String]) -> String {
    let mut text = String::new();
    let mut previous = 0usize;
    for step in 0..steps {
        let row = &probs[step * classes..(step + 1) * classes];
        let mut best = 0usize;
        for (k, v) in row.iter().enumerate() {
            if *v > row[best] {
                best = k;
            }
        }
        if best != previous && best != 0 {
            if let Some(c) = chars.get(best) {
                text.push_str(c);
            }
        }
        previous = best;
    }
    text
}

/// Turns the detector's probability map into areas. Each connected region of likely text becomes one area, and the
/// area is grown a little (DB's unclip rule) so the letters are not cut at the edge.
pub fn boxes_from_map(
    prob: &[f32],
    h: usize,
    w: usize,
    scale: (f32, f32),
    size: (u32, u32),
) -> Vec<[f32; 4]> {
    // A 2x2 dilation, so letters that touch only at a corner join into one area.
    let mut mask = vec![false; h * w];
    for y in 0..h {
        for x in 0..w {
            if prob[y * w + x] > PIXEL_THRESH {
                mask[y * w + x] = true;
                if x + 1 < w {
                    mask[y * w + x + 1] = true;
                }
                if y + 1 < h {
                    mask[(y + 1) * w + x] = true;
                    if x + 1 < w {
                        mask[(y + 1) * w + x + 1] = true;
                    }
                }
            }
        }
    }

    let mut seen = vec![false; h * w];
    let mut areas = Vec::new();
    for start in 0..h * w {
        if !mask[start] || seen[start] {
            continue;
        }
        if areas.len() >= MAX_AREAS {
            break;
        }
        // Flood fill with 8-connectivity.
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (usize::MAX, usize::MAX, 0usize, 0usize);
        let mut area = 0usize;
        let mut total = 0f32;
        let mut stack = vec![start];
        seen[start] = true;
        while let Some(p) = stack.pop() {
            let (y, x) = (p / w, p % w);
            area += 1;
            total += prob[p];
            min_x = min_x.min(x);
            max_x = max_x.max(x);
            min_y = min_y.min(y);
            max_y = max_y.max(y);
            for dy in -1i64..=1 {
                for dx in -1i64..=1 {
                    let ny = y as i64 + dy;
                    let nx = x as i64 + dx;
                    if ny < 0 || nx < 0 || ny >= h as i64 || nx >= w as i64 {
                        continue;
                    }
                    let q = ny as usize * w + nx as usize;
                    if mask[q] && !seen[q] {
                        seen[q] = true;
                        stack.push(q);
                    }
                }
            }
        }

        let bw = max_x - min_x + 1;
        let bh = max_y - min_y + 1;
        if bw < 3 || bh < 3 {
            continue;
        }
        let score = total / area as f32;
        if score < BOX_THRESH {
            continue;
        }
        let distance = area as f32 * UNCLIP_RATIO / (2.0 * (bw + bh) as f32);
        let x0 = (min_x as f32 - distance).max(0.0);
        let y0 = (min_y as f32 - distance).max(0.0);
        let x1 = (max_x as f32 + 1.0 + distance).min(w as f32);
        let y1 = (max_y as f32 + 1.0 + distance).min(h as f32);
        let (sx, sy) = scale;
        let (w0, h0) = (size.0 as f32, size.1 as f32);
        let back = [
            (x0 / sx).clamp(0.0, w0),
            (y0 / sy).clamp(0.0, h0),
            (x1 / sx).clamp(0.0, w0),
            (y1 / sy).clamp(0.0, h0),
        ];
        areas.push(back);
    }
    areas
}

struct Row {
    bounds: [f32; 4],
    parts: Vec<[f32; 4]>,
}

/// Joins areas that sit on the same text line: they overlap vertically by more than half their height and are less
/// than one height apart. Words of a line come out left to right.
pub fn group_lines(mut areas: Vec<[f32; 4]>) -> Vec<Vec<[f32; 4]>> {
    let centre = |b: &[f32; 4]| (b[1] + b[3]) / 2.0;
    areas.sort_by(|a, b| centre(a).partial_cmp(&centre(b)).unwrap_or(std::cmp::Ordering::Equal));
    let mut rows: Vec<Row> = Vec::new();
    for b in areas {
        let joined = rows.iter_mut().find(|row| {
            let g = row.bounds;
            let overlap = g[3].min(b[3]) - g[1].max(b[1]);
            let height = (g[3] - g[1]).min(b[3] - b[1]);
            let gap = (b[0] - g[2]).max(g[0] - b[2]);
            overlap > 0.5 * height && gap < height
        });
        match joined {
            Some(row) => {
                let g = &mut row.bounds;
                *g = [g[0].min(b[0]), g[1].min(b[1]), g[2].max(b[2]), g[3].max(b[3])];
                row.parts.push(b);
            }
            None => rows.push(Row { bounds: b, parts: vec![b] }),
        }
    }
    rows.into_iter()
        .map(|row| {
            let mut parts = row.parts;
            parts.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap_or(std::cmp::Ordering::Equal));
            parts
        })
        .collect()
}

static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

static OCRS_ENGINE: Mutex<Option<ocrs::OcrEngine>> = Mutex::new(None);

/// Reads the text of a PNG or JPEG picture with the engine named (`ppocr` or `ocrs`), using its installed models.
pub fn recognise(root: &Path, engine: &str, picture: &[u8]) -> Result<Vec<Line>, String> {
    let img = image::load_from_memory(picture)
        .map_err(|e| format!("the picture cannot be read: {}", e))?
        .to_rgb8();
    if engine == ENGINE_OCRS {
        return read_with_ocrs(root, &img);
    }
    read_with_ppocr(root, &img)
}

fn read_with_ppocr(root: &Path, img: &RgbImage) -> Result<Vec<Line>, String> {
    if !installed(root) {
        return Err("the text recognition models are not installed".to_string());
    }
    let mut guard = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
    if guard.is_none() {
        *guard = Some(Engine::load(&dir(root))?);
    }
    match guard.as_mut() {
        Some(engine) => engine.read_page(img),
        None => Err("the text recognition engine did not start".to_string()),
    }
}

/// Reads a picture with ocrs: detect the words, group them into lines, then recognise each line. Each line's box is
/// the bounds of its word rectangles, in picture pixels.
fn read_with_ocrs(root: &Path, img: &RgbImage) -> Result<Vec<Line>, String> {
    if !ocrs_installed(root) {
        return Err("the ocrs models are not installed".to_string());
    }
    let mut guard = OCRS_ENGINE.lock().unwrap_or_else(|p| p.into_inner());
    if guard.is_none() {
        let d = ocrs_dir(root);
        let detection = rten::Model::load_file(d.join(OCRS_FILES[0].0))
            .map_err(|e| format!("cannot load the detection model: {}", e))?;
        let recognition = rten::Model::load_file(d.join(OCRS_FILES[1].0))
            .map_err(|e| format!("cannot load the recognition model: {}", e))?;
        let engine = ocrs::OcrEngine::new(ocrs::OcrEngineParams {
            detection_model: Some(detection),
            recognition_model: Some(recognition),
            ..Default::default()
        })
        .map_err(|e| format!("cannot start ocrs: {}", e))?;
        *guard = Some(engine);
    }
    let engine = match guard.as_ref() {
        Some(engine) => engine,
        None => return Err("the ocrs engine did not start".to_string()),
    };
    let (width, height) = img.dimensions();
    let source = ocrs::ImageSource::from_bytes(img.as_raw(), (width, height))
        .map_err(|e| format!("the picture cannot be read: {}", e))?;
    let input = engine.prepare_input(source).map_err(|e| format!("the picture cannot be prepared: {}", e))?;
    let words = engine.detect_words(&input).map_err(|e| format!("text detection failed: {}", e))?;
    let lines = engine.find_text_lines(&input, &words);
    let texts = engine.recognize_text(&input, &lines).map_err(|e| format!("text recognition failed: {}", e))?;
    let mut out = Vec::new();
    for (line, text) in lines.iter().zip(texts) {
        let Some(text) = text else { continue };
        let text = text.to_string();
        if text.trim().is_empty() {
            continue;
        }
        let (mut left, mut top, mut right, mut bottom) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for rect in line {
            for corner in rect.corners() {
                left = left.min(corner.x);
                top = top.min(corner.y);
                right = right.max(corner.x);
                bottom = bottom.max(corner.y);
            }
        }
        out.push(Line { text, bbox: [pixel(left), pixel(top), pixel(right), pixel(bottom)] });
    }
    Ok(out)
}

fn pixel(value: f32) -> u32 {
    if value.is_finite() && value > 0.0 {
        value.round() as u32
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_installed_engine_is_picked() {
        let dir = std::env::temp_dir().join(format!("atlas-ocr-pick-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(engine_for(&dir, ENGINE_OCRS), None, "nothing installed");
        let d = ocrs_dir(&dir);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join(MARKER), "{}").unwrap();
        for file in OCRS_FILES {
            fs::write(d.join(file.0), b"x").unwrap();
        }
        assert_eq!(installed_engines(&dir), vec![ENGINE_OCRS]);
        assert_eq!(engine_for(&dir, ENGINE_PPOCR), Some(ENGINE_OCRS), "falls back to the installed engine");
        assert_eq!(engine_for(&dir, ENGINE_OCRS), Some(ENGINE_OCRS));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn metadata_text_reads_the_character_entry() {
        let mut bytes = vec![0xff, 0x00, 0x72, 0x20];
        bytes.extend_from_slice(&[0x0a, 9]);
        bytes.extend_from_slice(b"character");
        bytes.push(0x12);
        bytes.push(5);
        bytes.extend_from_slice("a\nb\nc".as_bytes());
        bytes.extend_from_slice(&[0x00, 0x01]);
        assert_eq!(metadata_text(&bytes, "character").as_deref(), Some("a\nb\nc"));
        assert_eq!(metadata_text(&bytes, "missing"), None);
    }

    #[test]
    fn metadata_text_reads_long_values() {
        // A length of 300 needs two varint bytes.
        let value = "x".repeat(300);
        let mut bytes = vec![0x0a, 9];
        bytes.extend_from_slice(b"character");
        bytes.push(0x12);
        bytes.extend_from_slice(&[0xac, 0x02]);
        bytes.extend_from_slice(value.as_bytes());
        assert_eq!(metadata_text(&bytes, "character").map(|v| v.len()), Some(300));
    }

    #[test]
    fn dimension_names_lose_their_dots_and_keep_their_length() {
        let before = b"\x0a\x15p2o.DynamicDimension.0 and p2o.DynamicDimension.12 other.name".to_vec();
        let after = plain_dimension_names(&before);
        assert_eq!(after.len(), before.len());
        assert_eq!(&after[..], &b"\x0a\x15p2o_DynamicDimension_0 and p2o_DynamicDimension_12 other.name"[..]);
    }

    #[test]
    fn ctc_drops_repeats_and_blanks() {
        let chars: Vec<String> = ["blank", "a", "b"].iter().map(|s| s.to_string()).collect();
        // Steps pick: a, a, blank, b, b  -> "ab"
        let probs = [
            0.0, 0.9, 0.1, //
            0.0, 0.8, 0.2, //
            0.9, 0.05, 0.05, //
            0.1, 0.1, 0.8, //
            0.0, 0.2, 0.8,
        ];
        assert_eq!(ctc_greedy(&probs, 5, 3, &chars), "ab");
    }

    #[test]
    fn a_blob_on_the_map_becomes_one_grown_area() {
        let (h, w) = (40usize, 40usize);
        let mut prob = vec![0f32; h * w];
        for y in 5..15 {
            for x in 5..15 {
                prob[y * w + x] = 0.9;
            }
        }
        let areas = boxes_from_map(&prob, h, w, (1.0, 1.0), (40, 40));
        assert_eq!(areas.len(), 1);
        let a = areas[0];
        // The dilation makes the blob 11 pixels wide, so the unclip grows it by 4 on each side.
        assert!(a[0] <= 5.0 && a[0] >= 0.0, "{:?}", a);
        assert!(a[2] >= 15.0 && a[2] <= 40.0, "{:?}", a);
    }

    #[test]
    fn words_on_one_line_are_joined_and_other_lines_kept_apart() {
        let lines = group_lines(vec![
            [60.0, 11.0, 100.0, 31.0],
            [0.0, 10.0, 50.0, 30.0],
            [0.0, 100.0, 50.0, 120.0],
        ]);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].len(), 2);
        assert_eq!(lines[0][0][0], 0.0, "words are left to right");
        assert_eq!(lines[1].len(), 1);
    }

    #[test]
    fn installed_is_false_without_the_files() {
        let dir = std::env::temp_dir().join(format!("atlas-ocr-empty-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert!(!installed(&dir));
    }

    /// Installs the models and reads a sample page. It downloads about 15 MB, so it runs only when the
    /// ATLAS_OCR_TEST variable is set (the CI job sets it).
    #[test]
    fn reads_the_sample_page_when_enabled() {
        if std::env::var("ATLAS_OCR_TEST").is_err() {
            eprintln!("skipped: set ATLAS_OCR_TEST=1 to download the models and read the sample");
            return;
        }
        let root = std::env::temp_dir().join(format!("atlas-ocr-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        install(&root, &Transfer::quiet()).expect("install");
        let picture = include_bytes!("testdata/ocr-sample.png");
        let lines = recognise(&root, ENGINE_PPOCR, picture).expect("recognise");
        let all: String = lines.iter().map(|l| l.text.to_lowercase()).collect::<Vec<_>>().join(" | ");
        assert!(all.contains("world"), "read: {}", all);
        assert!(all.contains("offline"), "read: {}", all);
        let _ = fs::remove_dir_all(&root);
    }

    /// The same sample read by the ocrs engine. Like the test above, it runs only when ATLAS_OCR_TEST is set.
    #[test]
    fn ocrs_reads_the_sample_page_when_enabled() {
        if std::env::var("ATLAS_OCR_TEST").is_err() {
            eprintln!("skipped: set ATLAS_OCR_TEST=1 to download the ocrs models and read the sample");
            return;
        }
        let root = std::env::temp_dir().join(format!("atlas-ocrs-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        install_ocrs(&root, &Transfer::quiet()).expect("install ocrs");
        let picture = include_bytes!("testdata/ocr-sample.png");
        let lines = recognise(&root, ENGINE_OCRS, picture).expect("recognise with ocrs");
        let all: String = lines.iter().map(|l| l.text.to_lowercase()).collect::<Vec<_>>().join(" | ");
        assert!(all.contains("world"), "read: {}", all);
        assert!(all.contains("offline"), "read: {}", all);
        let _ = fs::remove_dir_all(&root);
    }
}
