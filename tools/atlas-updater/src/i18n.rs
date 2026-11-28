//! The text of the helper's window and tray, in the language chosen in Settings.
//!
//! English is the source. Each string is written in English in the code, wrapped in `tr("...")`, and the English text
//! is the key. A language has one JSON file in `i18n/`, which maps each English text to its translation. A text with no
//! translation (or a language with no file) is shown in English, so a missing translation never leaves a gap.

use std::sync::Mutex;

use crate::json::{self, Value};

/// The languages that have a translation file, by code (as in `_locales`, with `_` between the parts).
const FILES: &[(&str, &str)] = &[
    ("af", include_str!("../i18n/af.json")),
    ("ar", include_str!("../i18n/ar.json")),
    ("bn", include_str!("../i18n/bn.json")),
    ("ca", include_str!("../i18n/ca.json")),
    ("cs", include_str!("../i18n/cs.json")),
    ("da", include_str!("../i18n/da.json")),
    ("de", include_str!("../i18n/de.json")),
    ("el", include_str!("../i18n/el.json")),
    ("es", include_str!("../i18n/es.json")),
    ("fa", include_str!("../i18n/fa.json")),
    ("fi", include_str!("../i18n/fi.json")),
    ("fr", include_str!("../i18n/fr.json")),
    ("he", include_str!("../i18n/he.json")),
    ("hi", include_str!("../i18n/hi.json")),
    ("hr", include_str!("../i18n/hr.json")),
    ("hu", include_str!("../i18n/hu.json")),
    ("is", include_str!("../i18n/is.json")),
    ("it", include_str!("../i18n/it.json")),
    ("ja", include_str!("../i18n/ja.json")),
    ("kaa", include_str!("../i18n/kaa.json")),
    ("ko", include_str!("../i18n/ko.json")),
    ("lv", include_str!("../i18n/lv.json")),
    ("nl", include_str!("../i18n/nl.json")),
    ("no", include_str!("../i18n/no.json")),
    ("pl", include_str!("../i18n/pl.json")),
    ("pt_BR", include_str!("../i18n/pt_BR.json")),
    ("pt_PT", include_str!("../i18n/pt_PT.json")),
    ("ro", include_str!("../i18n/ro.json")),
    ("ru", include_str!("../i18n/ru.json")),
    ("sl", include_str!("../i18n/sl.json")),
    ("sr", include_str!("../i18n/sr.json")),
    ("sv", include_str!("../i18n/sv.json")),
    ("th", include_str!("../i18n/th.json")),
    ("tr", include_str!("../i18n/tr.json")),
    ("ug", include_str!("../i18n/ug.json")),
    ("uk", include_str!("../i18n/uk.json")),
    ("vi", include_str!("../i18n/vi.json")),
    ("zh_CN", include_str!("../i18n/zh_CN.json")),
    ("zh_TW", include_str!("../i18n/zh_TW.json")),
];

/// The translation table of the chosen language. None means English.
static ACTIVE: Mutex<Option<Value>> = Mutex::new(None);

/// Chooses the language: "system" follows the computer, a code such as "fr" or "zh-CN" picks that language.
pub fn set_language(setting: &str) {
    let wanted = if setting.is_empty() || setting == "system" {
        sys_locale::get_locale().unwrap_or_default()
    } else {
        setting.to_string()
    };
    let table = find(&wanted).and_then(|text| json::parse(text).ok());
    *ACTIVE.lock().unwrap_or_else(|p| p.into_inner()) = table;
}

/// The translation file for a language tag, if there is one. An exact match wins (zh-CN, pt_BR). A region without
/// its own file uses the file of its language (fr-FR, fr-CA), unless that language has regional files of its own:
/// then zh-TW does not get zh_CN, and pt-PT does not get pt_BR. Such a region with no file of its own is shown in English.
fn find(tag: &str) -> Option<&'static str> {
    let tag = tag.replace('-', "_");
    if let Some((_, text)) = FILES.iter().find(|(code, _)| code.eq_ignore_ascii_case(&tag)) {
        return Some(text);
    }
    let base = tag.split('_').next().unwrap_or("");
    let has_regional_files = FILES.iter().any(|(code, _)| {
        code.contains('_') && code.split('_').next().unwrap_or("").eq_ignore_ascii_case(base)
    });
    if tag.contains('_') && has_regional_files {
        return None;
    }
    FILES
        .iter()
        .find(|(code, _)| code.split('_').next().unwrap_or("").eq_ignore_ascii_case(base))
        .map(|(_, text)| *text)
}

/// The text to show for an English source text.
pub fn tr(source: &str) -> String {
    let guard = ACTIVE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(table) = guard.as_ref() {
        if let Some(text) = table.get(source).and_then(Value::as_str) {
            if !text.is_empty() {
                return text.to_string();
            }
        }
    }
    source.to_string()
}

/// The text for an English source with `{}` placeholders: the translation (or the English) with each `{}` filled in
/// order. Arguments are given already formatted, so a translation can keep them in its own order.
pub fn fill(template: &str, args: &[&dyn std::fmt::Display]) -> String {
    let mut out = String::new();
    let mut rest = template;
    let mut index = 0;
    while let Some(at) = rest.find("{}") {
        out.push_str(&rest[..at]);
        match args.get(index) {
            Some(arg) => out.push_str(&arg.to_string()),
            None => out.push_str("{}"),
        }
        index += 1;
        rest = &rest[at + 2..];
    }
    out.push_str(rest);
    out
}

/// `tr` for a text with placeholders: `trf!("Installed {} of {}", a, b)` looks up the English text and fills it in.
macro_rules! trf {
    ($source:expr $(, $arg:expr)* $(,)?) => {
        $crate::i18n::fill(&$crate::i18n::tr($source), &[$(&$arg as &dyn ::std::fmt::Display),*])
    };
}
pub(crate) use trf;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_translation_file_is_valid_json_with_text_values() {
        for (code, text) in FILES {
            let value = json::parse(text).unwrap_or_else(|e| panic!("{} is not valid JSON: {}", code, e));
            assert!(value.get("Cancel").is_some() || value.get("Quit").is_some(), "{} has no translations", code);
        }
    }

    #[test]
    fn placeholders_are_filled_in_order() {
        assert_eq!(fill("Installed {} of {}", &[&2, &3]), "Installed 2 of 3");
        assert_eq!(fill("{} to {}", &[&"fr", &"en"]), "fr to en");
        assert_eq!(fill("no placeholders", &[&1]), "no placeholders");
        assert_eq!(fill("{} and {}", &[&"one"]), "one and {}", "a missing argument keeps its placeholder");
    }

    #[test]
    fn languages_are_found_by_code_and_region() {
        assert!(find("fr").is_some());
        assert!(find("fr-CA").is_some(), "a region with no file of its own uses its language");
        assert!(find("fr_FR").is_some());
        assert!(find("pt-PT").is_some(), "Portugal has its own file");
        assert_ne!(find("pt-PT"), find("pt-BR"), "Portugal does not get the Brazilian file");
        assert!(find("zh-CN").is_some());
        assert!(find("zh_CN").is_some());
        assert!(find("zh-TW").is_some(), "Traditional Chinese has its own file");
        assert_ne!(find("zh-TW"), find("zh-CN"), "Traditional Chinese does not get the Simplified file");
        assert!(find("en").is_none());
        assert!(find("xx").is_none());
    }
}
