"use strict";

function _classStaticPrivateFieldSpecSet(receiver, classConstructor, descriptor, value) { _classCheckPrivateStaticAccess(receiver, classConstructor); _classCheckPrivateStaticFieldDescriptor(descriptor, "set"); _classApplyDescriptorSet(receiver, descriptor, value); return value; }
function _classApplyDescriptorSet(receiver, descriptor, value) { if (descriptor.set) { descriptor.set.call(receiver, value); } else { if (!descriptor.writable) { throw new TypeError("attempted to set read only private field"); } descriptor.value = value; } }
function _classStaticPrivateFieldSpecGet(receiver, classConstructor, descriptor) { _classCheckPrivateStaticAccess(receiver, classConstructor); _classCheckPrivateStaticFieldDescriptor(descriptor, "get"); return _classApplyDescriptorGet(receiver, descriptor); }
function _classCheckPrivateStaticFieldDescriptor(descriptor, action) { if (descriptor === undefined) { throw new TypeError("attempted to " + action + " private static field before its declaration"); } }
function _classCheckPrivateStaticAccess(receiver, classConstructor) { if (receiver !== classConstructor) { throw new TypeError("Private static access of wrong provenance"); } }
function _classApplyDescriptorGet(receiver, descriptor) { if (descriptor.get) { return descriptor.get.call(receiver); } return descriptor.value; }
const translationService = function () {
  const translationService = {};
  class Utils {
    /**
     * Replace the characters `& < > " '` with `&amp; &lt; &gt; &quot; &#39;`.
     *
     * Note: For bing translation, we want to use its custom dictionary feature,
     * we have to keep certain html tags, so we need to avoid them from being escaped.
     * These symbols are nothing, just to ensure that there are no such symbols in the original text.
     *
     * @param {string} unsafe
     * @returns {string} escapedString
     */
    static escapeHTML(unsafe) {
      const bingMarkFrontPart = '<mstrans:dictionary translation="';
      const bingMarkSecondPart = '"></mstrans:dictionary>';
      unsafe = unsafe.replaceAll(bingMarkFrontPart, "@-/629^*").replaceAll(bingMarkSecondPart, "^$537+*");
      unsafe = unsafe.replace(/\&/g, "&amp;").replace(/\</g, "&lt;").replace(/\>/g, "&gt;").replace(/\"/g, "&quot;").replace(/\'/g, "&#39;");
      unsafe = unsafe.replaceAll("@-/629^*", bingMarkFrontPart).replaceAll("^$537+*", bingMarkSecondPart);
      return unsafe;
    }

    /**
     * Replace the characters `&amp; &lt; &gt; &quot; &#39;` with `& < > " '`.
     * @param {string} unsafe
     * @returns {string} unescapedString
     */
    static unescapeHTML(unsafe) {
      return unsafe.replace(/\&amp;/g, "&").replace(/\&lt;/g, "<").replace(/\&gt;/g, ">").replace(/\&quot;/g, '"').replace(/\&\#39;/g, "'");
    }
  }
  class GoogleHelper {
    static get googleTranslateTKK() {
      return "448487.932609646";
    }

    /**
     *
     * @param {number} num
     * @param {string} optString
     * @returns {number}
     */
    static shiftLeftOrRightThenSumOrXor(num, optString) {
      for (let i = 0; i < optString.length - 2; i += 3) {
        /** @type {string|number} */
        let acc = optString.charAt(i + 2);
        if ("a" <= acc) {
          acc = acc.charCodeAt(0) - 87;
        } else {
          acc = Number(acc);
        }
        if (optString.charAt(i + 1) == "+") {
          acc = num >>> acc;
        } else {
          acc = num << acc;
        }
        if (optString.charAt(i) == "+") {
          num += acc & 4294967295;
        } else {
          num ^= acc;
        }
      }
      return num;
    }

    /**
     *
     * @param {string} query
     * @returns {Array<number>}
     */
    static transformQuery(query) {
      /** @type {Array<number>} */
      const bytesArray = [];
      let idx = 0;
      for (let i = 0; i < query.length; i++) {
        let charCode = query.charCodeAt(i);
        if (128 > charCode) {
          bytesArray[idx++] = charCode;
        } else {
          if (2048 > charCode) {
            bytesArray[idx++] = charCode >> 6 | 192;
          } else {
            if (55296 == (charCode & 64512) && i + 1 < query.length && 56320 == (query.charCodeAt(i + 1) & 64512)) {
              charCode = 65536 + ((charCode & 1023) << 10) + (query.charCodeAt(++i) & 1023);
              bytesArray[idx++] = charCode >> 18 | 240;
              bytesArray[idx++] = charCode >> 12 & 63 | 128;
            } else {
              bytesArray[idx++] = charCode >> 12 | 224;
            }
            bytesArray[idx++] = charCode >> 6 & 63 | 128;
          }
          bytesArray[idx++] = charCode & 63 | 128;
        }
      }
      return bytesArray;
    }

    /**
     * Calculates the hash (TK) of a query for google translator.
     * @param {string} query
     * @returns {string}
     */
    static calcHash(query) {
      const windowTkk = GoogleHelper.googleTranslateTKK;
      const tkkSplited = windowTkk.split(".");
      const tkkIndex = Number(tkkSplited[0]) || 0;
      const tkkKey = Number(tkkSplited[1]) || 0;
      const bytesArray = GoogleHelper.transformQuery(query);
      let encondingRound = tkkIndex;
      for (const item of bytesArray) {
        encondingRound += item;
        encondingRound = GoogleHelper.shiftLeftOrRightThenSumOrXor(encondingRound, "+-a^+6");
      }
      encondingRound = GoogleHelper.shiftLeftOrRightThenSumOrXor(encondingRound, "+-3^+b+-f");
      encondingRound ^= tkkKey;
      if (encondingRound <= 0) {
        encondingRound = (encondingRound & 2147483647) + 2147483648;
      }
      const normalizedResult = encondingRound % 1000000;
      return normalizedResult.toString() + "." + (normalizedResult ^ tkkIndex);
    }
  }
  /**
   * fetch() with a timeout. Service workers have no XMLHttpRequest timeout helpers, so use AbortController.
   * @param {string} url
   * @param {RequestInit} init
   * @param {number} ms
   * @returns {Promise<Response>}
   */
  function fetchWithTimeout(url, init = {}, ms = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  /**
   * The text the user sent, without the request wrapper (<pre>) or the inline <a i=N> tags that Google adds, and unescaped.
   * @param {string} text
   * @returns {string}
   */
  function plainSource(text) {
    return Utils.unescapeHTML(String(text || "").replace(/<\/?pre>/g, "").replace(/<\/?a(\s+i=\d+)?>/g, ""));
  }

  /**
   * Checks one translated text (part 5 of #1078). A translation that is empty for a text with words is not usable.
   * A text of at least 80 characters and eight words, returned unchanged by a known source language that is not the target, is not usable either.
   * Target-language, unknown-language and short unchanged texts are accepted.
   * @param {string} source the text as the user wrote it
   * @param {string} translated the translation as shown
   * @param {string|null} detectedLanguage
   * @param {string} targetLanguage
   * @returns {boolean}
   */
  function isUsableTranslation(source, translated, detectedLanguage, targetLanguage) {
    const src = String(source || "").trim();
    const out = String(translated || "").trim();
    if (src.length > 0 && out.length === 0) return false;
    if (src.length >= 80 && (src.match(/\p{L}+/gu) || []).length >= 8) {
      const known = Boolean(detectedLanguage) && detectedLanguage !== "und" && detectedLanguage !== "auto";
      const baseOf = code => String(code).split("-")[0].toLowerCase();
      if (known && targetLanguage && baseOf(detectedLanguage) !== baseOf(targetLanguage)) {
        const normalize = text => text.replace(/\s+/g, " ").toLowerCase();
        if (normalize(src) === normalize(out)) return false;
      }
    }
    return true;
  }

  /**
   * Yandex keeps a short-lived session id (SID) that is found on a public page.
   */
  class YandexHelper {
    /** @type {number | null} */
    static #lastRequestSidTime = null;
    /** @type {string | null} */
    static #translateSid = null;
    /** @type {boolean} */
    static #SIDNotFound = false;
    /** @type {Promise<void> | null} */
    static #findPromise = null;

    static get translateSid() {
      return YandexHelper.#translateSid;
    }
    /** Forgets the SID so the next request gets a fresh one (called after a failed request). */
    static invalidate() {
      YandexHelper.#translateSid = null;
      YandexHelper.#lastRequestSidTime = null;
    }

    /** The `srv` parameter depends on the SID length (mobile SIDs are longer). */
    static get param_srv() {
      return YandexHelper.#translateSid && YandexHelper.#translateSid.length > 40 ? "tr-touch-url" : "tr-url-widget";
    }

    /**
     * Finds the SID. The result is cached: 20 min when found, 10 min when not found, 5 min otherwise.
     * @returns {Promise<void>}
     */
    static async findSID() {
      if (YandexHelper.#findPromise) return await YandexHelper.#findPromise;
      const minutes = YandexHelper.#translateSid ? 20 : YandexHelper.#SIDNotFound ? 10 : 5;
      const expired = !YandexHelper.#lastRequestSidTime || Date.now() - YandexHelper.#lastRequestSidTime > minutes * 60000;
      if (!expired) return;
      YandexHelper.#lastRequestSidTime = Date.now();
      YandexHelper.#findPromise = YandexHelper.#fetchSID().finally(() => {
        YandexHelper.#findPromise = null;
      });
      return await YandexHelper.#findPromise;
    }

    /**
     * Pulls the session id out of the proxy page. The page's markup has changed before (for example the spacing or
     * the quotes around sid), so the match accepts those variants, case-insensitively, and returns only the id.
     * @param {string} text
     * @returns {string | null}
     */
    static extractSid(text) {
      const match = /(?<![\w-])["']?sid["']?\s*:\s*["']([0-9A-Za-z._-]{8,})["']/i.exec(text);
      return match ? match[1] : null;
    }

    static async #fetchSID() {
      try {
        const response = await fetchWithTimeout("https://translated.turbopages.org/proxy_u/en-es.en/https/example.com/");
        const text = await response.text();
        const sid = YandexHelper.extractSid(text);
        if (sid) {
          YandexHelper.#translateSid = sid;
          YandexHelper.#SIDNotFound = false;
        } else {
          YandexHelper.#SIDNotFound = true;
          console.warn("Yandex: no session id on the proxy page (HTTP " + response.status + "). The page layout may have changed.");
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  /**
   * Bing response: each request is `<b10>text</b10><b11>text</b11>...`. Plain text between the
   * tags is added to the next translated block. Entities are decoded without DOMParser,
   * because DOMParser does not exist in service workers.
   * @param {string} html
   * @param {boolean} dontSortResults
   * @returns {string[]}
   */
  function parseBingResult(html, dontSortResults) {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
    const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === "#") {
        const cp = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
      }
      const value = named[entity.toLowerCase()];
      return value !== undefined ? value : match;
    });
    const resultArray = [];
    const tagRegex = /<b(\d+)>([\s\S]*?)<\/b\1>/gi;
    let currText = "";
    let last = 0;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      currText += decode(html.slice(last, match.index));
      const text = currText + decode(match[2]);
      if (dontSortResults) {
        resultArray.push(text);
      } else {
        resultArray[parseInt(match[1], 10) - 10] = text;
      }
      currText = "";
      last = tagRegex.lastIndex;
    }
    return resultArray;
  }


  /**
   * Returns a string with additional parameters to be concatenated to the request URL.
   * @callback callback_cbParameters
   * @param {string} sourceLanguage
   * @param {string} targetLanguage
   * @param {Array<TranslationInfo>} requests
   * @returns {string}
   */

  /**
   * Takes `sourceArray` and returns a request string to the translation service.
   * @callback callback_cbTransformRequest
   * @param {string[]} sourceArray
   * @returns {string}
   */

  /**
   * @typedef {{text: string, detectedLanguage: string}} Service_Single_Result_Response
   */

  /**
   * Receives the response from the *http request* and returns `Service_Single_Result_Response[]`.
   *
   * Returns a string with the body of a request of type **POST**.
   * @callback callback_cbParseResponse
   * @param {Object} response
   * @returns {Array<Service_Single_Result_Response>}
   */

  /**
   * Takes a string formatted with the translated text and returns a `resultArray`.
   * @callback callback_cbTransformResponse
   * @param {String} result
   * @param {boolean} dontSortResults
   * @returns {string[]} resultArray
   */

  /**
   * Return extra headers for the request.
   * @callback callback_cbGetExtraHeaders
   * @returns {Array<{name: string, value: string}>} headers
   */

  /** @typedef {"complete" | "translating" | "error"} TranslationStatus */
  /**
   * @typedef {Object} TranslationInfo
   * @property {String} originalText
   * @property {String} translatedText
   * @property {String} detectedLanguage
   * @property {TranslationStatus} status
   * @property {Promise<void>} waitTranlate
   */

  /**
   * Base class to create new translation services.
   */
  /** @type {number} */
  var _lastRequestAuthTime = {
    writable: true,
    value: null
  };
  /** @type {string} */
  var _translateAuth = {
    writable: true,
    value: null
  };
  /** @type {boolean} */
  var _AuthNotFound = {
    writable: true,
    value: false
  };
  /** @type {Promise<void>} */
  var _authPromise = {
    writable: true,
    value: null
  };
  /** Thrown when a service asks the user to solve a captcha first. `captchaUrl` is the page to show. */
  class ServiceCaptchaError extends Error {
    constructor(serviceName, captchaUrl) {
      super(serviceName + ": captcha required");
      this.name = "ServiceCaptchaError";
      this.serviceName = serviceName;
      this.captchaUrl = captchaUrl;
    }
  }

  class Service {
    /**
     * Initializes the **Service** class with information about the new translation service.
     * @param {string} serviceName
     * @param {string} baseURL
     * @param {"GET" | "POST"} xhrMethod
     * @param {callback_cbTransformRequest} cbTransformRequest Takes `sourceArray` and returns a request string to the translation service.
     * @param {callback_cbParseResponse} cbParseResponse Receives the response from the *http request* and returns `Service_Single_Result_Response[]`.
     * @param {callback_cbTransformResponse} cbTransformResponse Takes a string formatted with the translated text and returns a `resultArray`.
     * @param {callback_cbParameters} cbGetExtraParameters Returns a string with additional parameters to be concatenated to the request URL.
     * @param {callback_cbParameters} cbGetRequestBody Returns a string with the body of a request of type **POST**.
     * @param {callback_cbGetExtraHeaders} cbGetExtraHeaders Return extra headers for the request.
     */
    constructor(serviceName, baseURL, xhrMethod = "GET", cbTransformRequest, cbParseResponse, cbTransformResponse, cbGetExtraParameters = null, cbGetRequestBody = null, cbGetExtraHeaders = null) {
      this.serviceName = serviceName;
      this.baseURL = baseURL;
      this.xhrMethod = xhrMethod;
      this.cbTransformRequest = cbTransformRequest;
      this.cbParseResponse = cbParseResponse;
      this.cbTransformResponse = cbTransformResponse;
      this.cbGetExtraParameters = cbGetExtraParameters;
      this.cbGetRequestBody = cbGetRequestBody;
      this.cbGetExtraHeaders = cbGetExtraHeaders;

      /**
       * @type {Map<string, TranslationInfo>}
       *
       * It works as an in-memory translation cache.
       * Ensures that two identical requests share the same `XMLHttpRequest`.
       * */
      this.translationsInProgress = new Map();
    }

    /**
     * Removes all translations with `status` **error** and are in `translationsInProgress`.
     *
     * Sometimes there is a device translation error due to internet connection problems.
     * Clearing translationsInProgress ensures that the translation will be retried.
     */
    removeTranslationsWithError() {
      this.translationsInProgress.forEach((transInfo, key) => {
        if (transInfo.status === "error") {
          this.translationsInProgress.delete(key);
        }
      });
    }

    /**
     * Whether one result of this service is usable (see isUsableTranslation). A result the service cannot parse is not usable.
     * @param {string} originalText the request text of the row
     * @param {string} translatedText the result as the service returned it
     * @param {string|null} detectedLanguage
     * @param {string} targetLanguage
     * @param {boolean} dontSortResults
     * @returns {boolean}
     */
    isUsableResult(originalText, translatedText, detectedLanguage, targetLanguage, dontSortResults = false) {
      try {
        const shown = this.cbTransformResponse(translatedText, dontSortResults);
        const text = Array.isArray(shown) ? shown.join(" ") : String(shown ?? "");
        return isUsableTranslation(plainSource(originalText), text, detectedLanguage, targetLanguage);
      } catch (e) {
        return false;
      }
    }

    /**
     * Receives the `sourceArray2d` parameter and prepares the requests.
     * Calls `cbTransformRequest` for each `sourceArray` of `sourceArray2d`.
     * The `currentTranslationsInProgress` array will be the **final result** with requests already completed or in progress. And the `requests` array will only contain the new requests that need to be made.
     *
     * Checks if there is already an identical request in progress or if it is already in the translation cache.
     * If it doesn't exist, add it to `requests` to make a new *http request*.
     *
     * Requests longer than **800 characters** will be split into new requests.
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Array<string[]>} sourceArray2d
     * @returns {Promise<[Array<TranslationInfo[]>, TranslationInfo[]]>} `requests`, `currentTranslationsInProgress`
     */
    async getRequests(sourceLanguage, targetLanguage, sourceArray2d) {
      /** @type {Array<TranslationInfo[]>} */
      const requests = [];
      /** @type {TranslationInfo[]} */
      const currentTranslationsInProgress = [];
      /** @type {TranslationInfo[]} texts that are new to this service and still need a cache lookup */
      const lookups = [];
      for (const sourceArray of sourceArray2d) {
        const requestString = this.fixString(this.cbTransformRequest(sourceArray));
        const requestHash = [sourceLanguage, targetLanguage, requestString].join(", ");
        const progressInfo = this.translationsInProgress.get(requestHash);
        if (progressInfo) {
          currentTranslationsInProgress.push(progressInfo);
        } else {
          /** @type {TranslationStatus} */
          let status = "translating";
          /** @type {() => void} */
          let promise_resolve = null;

          /** @type {TranslationInfo} */
          const progressInfo = {
            originalText: requestString,
            requestHash,
            translatedText: null,
            detectedLanguage: null,
            get status() {
              return status;
            },
            set status(_status) {
              status = _status;
              promise_resolve();
            },
            waitTranlate: new Promise(resolve => promise_resolve = resolve)
          };
          currentTranslationsInProgress.push(progressInfo);
          // Registered before any await, so a concurrent call waits for this text instead of requesting it again.
          this.translationsInProgress.set(requestHash, progressInfo);
          lookups.push(progressInfo);
        }
      }

      // The cache lookups run together. They used to run one after another, so a screen of text waited on every read in turn.
      // A failed read counts as a miss, so one bad entry does not block the rest.
      const cacheEntries = await Promise.all(lookups.map(progressInfo =>
        translationCache.get(this.serviceName, sourceLanguage, targetLanguage, progressInfo.originalText).catch(e => {
          console.error(e);
          return null;
        })));

      let currentRequest = [];
      let currentSize = 0;
      lookups.forEach((progressInfo, i) => {
        const cacheEntry = cacheEntries[i];
        // A stored entry that is no longer usable (empty, or unchanged in a known foreign language) is fetched again.
        if (cacheEntry && this.isUsableResult(progressInfo.originalText, cacheEntry.translatedText, cacheEntry.detectedLanguage, targetLanguage)) {
          progressInfo.translatedText = cacheEntry.translatedText;
          progressInfo.detectedLanguage = cacheEntry.detectedLanguage;
          progressInfo.status = "complete";
          //this.translationsInProgress.delete([sourceLanguage, targetLanguage, requestString])
        } else {
          currentRequest.push(progressInfo);
          currentSize += progressInfo.originalText.length;
          if (currentSize > 800) {
            requests.push(currentRequest);
            currentSize = 0;
            currentRequest = [];
          }
        }
      });
      if (currentRequest.length > 0) {
        requests.push(currentRequest);
        currentRequest = [];
        currentSize = 0;
      }
      return [requests, currentTranslationsInProgress];
    }

    /**
     * Makes a request using the *XMLHttpRequest* API. Returns a promise that will be resolved with the result of the request. If the request fails, the promise will be rejected.
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Array<TranslationInfo>} requests
     * @returns {Promise<*>}
     */
    /** Returns the captcha page URL when the response is a captcha challenge, otherwise null. Services override it. */
    captchaUrlFromResponse(xhr) {
      return null;
    }

    async makeRequest(sourceLanguage, targetLanguage, requests) {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        // Cookies are not sent unless a service asked for them after a captcha (see sendCookies).
        xhr.withCredentials = this.sendCookies === true;
        if ("mozAnon" in xhr) xhr.mozAnon = this.sendCookies !== true; // Firefox: no cookies unless a captcha was solved
        xhr.open(this.xhrMethod, this.baseURL + (this.cbGetExtraParameters ? this.cbGetExtraParameters(sourceLanguage, targetLanguage, requests) : ""));
        if (this.cbGetExtraHeaders) {
          const headers = this.cbGetExtraHeaders();
          headers.forEach(header => {
            xhr.setRequestHeader(header.name, header.value);
          });
        }
        xhr.responseType = "json";
        xhr.timeout = 30000; // a hung request must not block the translation queue forever
        xhr.onload = event => {
          const captchaUrl = this.captchaUrlFromResponse(xhr);
          if (captchaUrl) {
            reject(new ServiceCaptchaError(this.serviceName, captchaUrl));
            return;
          }
          resolve(xhr.response);
        };
        xhr.onerror = xhr.onabort = xhr.ontimeout = event => {
          console.error(event);
          reject();
        };
        xhr.send(this.cbGetRequestBody ? this.cbGetRequestBody(sourceLanguage, targetLanguage, requests) : undefined);
      });
    }

    /**
     * Translates the `sourceArray2d`.
     *
     * If `dontSaveInPersistentCache` is **true** then the translation result will not be saved in the on-disk translation cache, only in the in-memory cache.
     *
     * The `dontSortResults` parameter is only valid when using the ***google*** translation service, if its value is **true** then the translation result will not be sorted.
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Array<string[]>} sourceArray2d
     * @param {boolean} dontSaveInPersistentCache
     * @param {boolean} dontSortResults
     * @returns {Promise<string[][]>}
     */
    async translate(sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache = false, dontSortResults = false) {
      const [requests, currentTranslationsInProgress] = await this.getRequests(sourceLanguage, targetLanguage, sourceArray2d);
      /** @type {Promise<void>[]} */
      const promises = [];
      let captchaError = null;
      // A request that fails does not throw, so the caller can only tell from this count that the service failed.
      let failedRequests = 0;
      for (const request of requests) {
        promises.push(this.makeRequest(sourceLanguage, targetLanguage, request).then(response => {
          const results = this.cbParseResponse(response);
          let unusable = 0;
          for (const idx in request) {
            const result = results[idx];
            const transInfo = request[idx];
            // Only this row is marked as failed. The other rows of the batch keep their results, and are cached below.
            if (!result || !this.isUsableResult(transInfo.originalText, result.text, result.detectedLanguage, targetLanguage, dontSortResults)) {
              transInfo.status = "error";
              unusable++;
              continue;
            }
            transInfo.detectedLanguage = result.detectedLanguage || "und";
            transInfo.translatedText = result.text;
            transInfo.status = "complete";
            if (dontSaveInPersistentCache === false && transInfo.translatedText) {
              translationCache.set(this.serviceName, sourceLanguage, targetLanguage, transInfo.originalText, transInfo.translatedText, transInfo.detectedLanguage);
            }
          }
          if (unusable > 0) {
            throw new Error(`${this.serviceName}: ${unusable} result(s) were empty or unchanged`);
          }
        }).catch(e => {
          console.error(e);
          failedRequests++;
          if (e instanceof ServiceCaptchaError) {
            captchaError = e;
            this.sendCookies = true; // the captcha is solved in the browser, so its cookie must be sent next time
          }
          for (const transInfo of request) {
            // Rows that already have a usable result keep it. Only the rest of the request is marked as failed.
            if (transInfo.status !== "complete") transInfo.status = "error";
            //this.translationsInProgress.delete([sourceLanguage, targetLanguage, transInfo.originalText])
          }
        }));
      }

      await Promise.all(currentTranslationsInProgress.map(transInfo => transInfo.waitTranlate));
      // Finished entries are released so the map does not keep every translated text in memory.
      for (const transInfo of currentTranslationsInProgress) {
        if (this.translationsInProgress.get(transInfo.requestHash) === transInfo) {
          this.translationsInProgress.delete(transInfo.requestHash);
        }
      }
      await Promise.all(promises);
      if (captchaError) throw captchaError;
      if (requests.length > 0 && failedRequests === requests.length) {
        throw new Error(`${this.serviceName}: every request failed`);
      }
      return currentTranslationsInProgress.map(transInfo => this.cbTransformResponse(transInfo.translatedText, dontSortResults));
    }

    /**
     * @param {string} str
     * @returns {string} fixedStr
     */
    fixString(str) {
      return str.replace(/\u200b/g, " ");
    }
  }
  const googleService = new class extends Service {
    constructor() {
      super("google", "https://translate.googleapis.com/translate_a/t?anno=3&client=te&v=1.0&format=html", "POST", function cbTransformRequest(sourceArray) {
        sourceArray = sourceArray.map(text => Utils.escapeHTML(text));
        if (sourceArray.length > 1) {
          sourceArray = sourceArray.map((text, index) => `<a i=${index}>${text}</a>`);
        }
        // the <pre> tag is to preserve the text formating
        return `<pre>${sourceArray.join("")}</pre>`;
      }, function cbParseResponse(response) {
        /** @type {[Service_Single_Result_Response]} */
        let responseJson;
        if (typeof response === "string") {
          responseJson = [{
            text: response,
            detectedLanguage: null
          }];
        } else if (typeof response[0] === "string") {
          responseJson = response.map( /** @returns {Service_Single_Result_Response} */( /** @type {string} */value) => ({
            text: value,
            detectedLanguage: null
          }));
        } else {
          responseJson = response.map( /** @returns {Service_Single_Result_Response} */( /** @type {[string, string]} */value) => ({
            text: value[0],
            detectedLanguage: value[1]
          }));
        }
        return responseJson;
      }, function cbTransformResponse(result, dontSortResults) {
        // remove the <pre> tag from the response
        if (result.indexOf("<pre") !== -1) {
          result = result.replace("</pre>", "");
          const index = result.indexOf(">");
          result = result.slice(index + 1);
        }

        /** @type {string[]} */
        const sentences = []; // each translated sentence is inside of <b> tag

        // The main objective is to remove the original text of each sentense that is inside the <i> tags.
        // Keeping only the <a> tags
        let idx = 0;
        while (true) {
          // each translated sentence is inside of <b> tag
          const sentenceStartIndex = result.indexOf("<b>", idx);
          if (sentenceStartIndex === -1) break;

          // the <i> tag is the original text in each sentence
          const sentenceFinalIndex = result.indexOf("<i>", sentenceStartIndex);
          if (sentenceFinalIndex === -1) {
            sentences.push(result.slice(sentenceStartIndex + 3));
            break;
          } else {
            sentences.push(result.slice(sentenceStartIndex + 3, sentenceFinalIndex));
          }
          idx = sentenceFinalIndex;
        }

        // maybe the response don't have any sentence (does not have <i> and <b> tags), is this case just use de result
        result = sentences.length > 0 ? sentences.join(" ") : result;
        // Remove the remaining </b> tags (usually the last)
        result = result.replace(/\<\/b\>/g, "");
        // Capture each <a i={number}> and put it in an array, the </a> will be ignored
        // maybe the same index appears several times
        // maybe some text will be outside of <a i={number}> (Usually text before the first <a> tag, and some whitespace between the <a> tags),
        // in this case, The outside text will be placed inside the <a i={number}> closer
        // TODO lidar com tags dentro de tags e tags vazias
        // https://de.wikipedia.org/wiki/Wikipedia:Hauptseite
        // "{\"originalText\":\"<pre><a i=0>\\nFür den </a><a i=1>37. Schreib­wettbewerb</a><a i=2> und den </a><a i=3>18. Miniaturwettbewerb</a><a i=4> können ab sofort Artikel nominiert werden.</a></pre>\",\"translatedText\":\"<pre><a i=0>\\n</a>Artigos já podem ser indicados <a i=0>para o</a> <a i=1>37º Concurso de Redação <a i=2>e</a></a> <a i=3><a i=4>18º</a> Concurso de Miniaturas</a> .</pre>\",\"detectedLanguage\":\"de\",\"status\":\"complete\",\"waitTranlate\":{}}"
        let resultArray = [];
        let lastEndPos = 0;
        for (const r of result.matchAll(/(\<a\si\=[0-9]+\>)([^\<\>]*(?=\<\/a\>))*/g)) {
          const fullText = r[0];
          const fullLength = r[0].length;
          const pos = r.index;
          // if it is bigger then it has text outside the tags
          if (pos > lastEndPos) {
            const aTag = r[1];
            const insideText = r[2] || "";
            const outsideText = result.slice(lastEndPos, pos).replace(/\<\/a\>/g, "");
            resultArray.push(aTag + outsideText + insideText);
          } else {
            resultArray.push(fullText);
          }
          lastEndPos = pos + fullLength;
        }

        // captures the final text outside the <a> tag
        {
          const lastOutsideText = result.slice(lastEndPos).replace(/\<\/a\>/g, "");
          if (resultArray.length > 0) {
            resultArray[resultArray.length - 1] += lastOutsideText;
          }
        }
        // this is the old method, don't capture text outside of <a> tags
        // let resultArray = result.match(
        //   /\<a\si\=[0-9]+\>[^\<\>]*(?=\<\/a\>)/g
        // );

        let indexes;
        // each inline tag has a index starting with 0 <a i={number}>
        if (resultArray && resultArray.length > 0) {
          // get the indexed of <a i={number}>
          indexes = resultArray.map(value => parseInt(value.match(/[0-9]+(?=\>)/g)[0])).filter(value => !isNaN(value));
          // get the text inside of <a i={number}>
          resultArray = resultArray.map(value => {
            const resultStartAtIndex = value.indexOf(">");
            return value.slice(resultStartAtIndex + 1);
          });
        } else {
          // maybe the response don't have any <a i={number}>
          resultArray = [result];
          indexes = [0];
        }

        // unescapeHTML
        resultArray = resultArray.map(value => Utils.unescapeHTML(value));
        if (dontSortResults) {
          // Should not sort the <a i={number}> of Google Translate result
          // Instead of it, join the texts without sorting

          // /** @type {string[]} */
          // const finalResulArray = [];

          // for (const j in indexes) {
          //   finalResulArray[indexes[j]] = "";
          // }

          // resultArray.forEach((text, i) => {
          //   finalResulArray[
          //     Math.floor(i * (finalResulArray.length / resultArray.length))
          //   ] += text;
          // });

          // return finalResulArray;
          return resultArray;
        } else {
          // Sort Google translate results to keep the links with the correct name
          // Note: the links may also disappear; http://web.archive.org/web/20220919162911/https://de.wikipedia.org/wiki/Wikipedia:Hauptseite

          /** @type {string[]} */
          const finalResulArray = [];
          for (const j in indexes) {
            if (finalResulArray[indexes[j]]) {
              finalResulArray[indexes[j]] += " " + resultArray[j];
            } else {
              finalResulArray[indexes[j]] = resultArray[j];
            }
          }
          return finalResulArray;
        }
      }, function cbGetExtraParameters(sourceLanguage, targetLanguage, requests) {
        return `&sl=${sourceLanguage}&tl=${targetLanguage}&tk=${GoogleHelper.calcHash(requests.map(info => info.originalText).join(""))}`;
      }, function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
        return requests.map(info => `&q=${encodeURIComponent(info.originalText)}`).join("");
      }, function cbGetExtraHeaders() {
        return [{
          name: "Content-Type",
          value: "application/x-www-form-urlencoded"
        }];
      });
    }
  }();
  /** Language codes that differ between TWP and the Yandex API. */
  const yandexLanguageMap = { "zh-CN": "zh", "zh-TW": "zh", "es-MX": "es", "fr-CA": "fr", pt: "pt-BR", "pt-PT": "pt" };
  /** Language codes that differ between TWP and the Bing API. */
  const bingLanguageMap = {
    auto: "auto-detect", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant", tl: "fil", hmn: "mww", ku: "kmr",
    ckb: "ku", mn: "mn-Cyrl", no: "nb", lg: "lug", sr: "sr-Cyrl", "mni-Mtei": "mni"
  };

  const yandexService = new class extends Service {
    constructor() {
      super("yandex", "https://translate.yandex.net/api/v1/tr.json/translate?", "GET", function cbTransformRequest(sourceArray) {
        return sourceArray.map(value => Utils.escapeHTML(value)).join("<wbr>");
      }, function cbParseResponse(response) {
        const lang = response.lang;
        const detectedLanguage = lang ? lang.split("-")[0] : null;
        return response.text.map(text => ({ text, detectedLanguage }));
      }, function cbTransformResponse(result, dontSortResults) {
        return result.split("<wbr>").map(value => Utils.unescapeHTML(value));
      }, function cbGetExtraParameters(sourceLanguage, targetLanguage, requests) {
        const from = sourceLanguage === "auto" ? "" : sourceLanguage + "-";
        return `srv=${YandexHelper.param_srv}&id=${YandexHelper.translateSid}-0-0&format=html&lang=${from}${targetLanguage}` + requests.map(info => `&text=${encodeURIComponent(info.originalText)}`).join("");
      }, null, function cbGetExtraHeaders() {
        return [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }];
      });
    }

    /**
     * @param {boolean} dontSortResults This parameter is not needed in this translation service
     */
    /** Yandex sends a captcha challenge by redirecting to its showcaptcha page. */
    captchaUrlFromResponse(xhr) {
      return xhr.responseURL && /captcha/i.test(xhr.responseURL) ? xhr.responseURL : null;
    }

    async translate(sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache, dontSortResults = false) {
      await YandexHelper.findSID();
      if (!YandexHelper.translateSid) throw new Error("Yandex: the translator session id (SID) could not be found");
      sourceLanguage = yandexLanguageMap[sourceLanguage] || sourceLanguage;
      targetLanguage = yandexLanguageMap[targetLanguage] || targetLanguage;
      try {
        return await super.translate(sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache, dontSortResults);
      } catch (e) {
        YandexHelper.invalidate();
        throw e;
      }
    }
  }();

  const bingService = new class extends Service {
    constructor() {
      super("bing", "https://edge.microsoft.com/translate/translatetext?isEnterpriseClient=false", "POST", function cbTransformRequest(sourceArray) {
        let id = 10;
        return sourceArray.map(value => {
          const r = `<b${id}>${Utils.escapeHTML(value)}</b${id}>`;
          id++;
          return r;
        }).join("");
      }, function cbParseResponse(response) {
        return response.map(r => ({
          text: r.translations[0].text,
          detectedLanguage: r.detectedLanguage?.language
        }));
      }, function cbTransformResponse(result, dontSortResults) {
        return parseBingResult(result, dontSortResults);
      }, function cbGetExtraParameters(sourceLanguage, targetLanguage) {
        return `${sourceLanguage !== "auto-detect" ? "&from=" + sourceLanguage : ""}&to=${targetLanguage}`;
      }, function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
        return JSON.stringify(requests.map(info => info.originalText));
      }, function cbGetExtraHeaders() {
        return [{ name: "Content-Type", value: "application/json" }];
      });
    }

    /**
     * @param {boolean} dontSortResults This parameter is not needed in this translation service
     */
    async translate(sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache, dontSortResults = false) {
      sourceLanguage = bingLanguageMap[sourceLanguage] || sourceLanguage;
      targetLanguage = bingLanguageMap[targetLanguage] || targetLanguage;
      return await super.translate(sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache, dontSortResults);
    }
  }();
  /**
   * DeepL API (v2). Keys ending with ":fx" belong to the Free plan and must
   * use api-free.deepl.com; every other key uses api.deepl.com.
   * Auth: "Authorization: DeepL-Auth-Key <key>".
   */
  const deeplTargetLanguageMap = {
    en: "EN-US",
    "en-US": "EN-US",
    "en-GB": "EN-GB",
    pt: "PT-BR",
    "pt-BR": "PT-BR",
    "pt-PT": "PT-PT",
    "zh-CN": "ZH-HANS",
    zh: "ZH-HANS",
    "zh-TW": "ZH-HANT",
    no: "NB"
  };
  const deeplSourceLanguages = ["AR", "BG", "CS", "DA", "DE", "EL", "EN", "ES", "ET", "FI", "FR", "HU", "ID", "IT", "JA", "KO", "LT", "LV", "NB", "NL", "PL", "PT", "RO", "RU", "SK", "SL", "SV", "TR", "UK", "ZH"];

  /**
   * @param {string} apiKey
   * @returns {string} base URL of the DeepL API that matches the key
   */
  function getDeeplBaseURL(apiKey) {
    return apiKey.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  }

  /**
   * @param {string} lang TWP language code
   * @returns {string} DeepL target_lang code
   */
  function toDeeplTargetLanguage(lang) {
    return deeplTargetLanguageMap[lang] || lang.toUpperCase();
  }

  /**
   * @param {string} lang TWP language code
   * @returns {string|null} DeepL source_lang code, or null to let DeepL detect the language
   */
  function toDeeplSourceLanguage(lang) {
    if (!lang || lang === "auto" || lang === "auto-detect" || lang === "und") return null;
    let code;
    if (lang === "no") code = "NB";else if (lang.startsWith("zh")) code = "ZH";else if (lang.startsWith("pt")) code = "PT";else code = lang.split("-")[0].toUpperCase();
    return deeplSourceLanguages.includes(code) ? code : null;
  }

  /** XML escape used with `tag_handling: "xml"` so that every text segment keeps its own id. */
  function escapeXml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function unescapeXml(text) {
    return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }

  /**
   * Creates a DeepL service bound to one API key.
   * @param {string} apiKey
   * @returns {Service}
   */
  const createDeeplService = apiKey => {
    const DEEPL_MAX_TEXTS_PER_REQUEST = 50;
    return new class extends Service {
      constructor() {
        super("deepl", getDeeplBaseURL(apiKey) + "/v2/translate", "POST", function cbTransformRequest(sourceArray) {
          // every piece is wrapped in <x id="n"> so the result can be split back into pieces
          if (sourceArray.length === 1) return `<x id="0">${escapeXml(sourceArray[0])}</x>`;
          return sourceArray.map((text, index) => `<x id="${index}">${escapeXml(text)}</x>`).join("");
        }, function cbParseResponse(response) {
          return response.translations.map( /** @return {Service_Single_Result_Response} */value => ({
            text: value.text,
            detectedLanguage: value.detected_source_language ? value.detected_source_language.toLowerCase() : "und"
          }));
        }, function cbTransformResponse(result, dontSortResults) {
          const pieces = [];
          for (const match of result.matchAll(/<x id="(\d+)">([\s\S]*?)<\/x>/g)) {
            pieces[parseInt(match[1], 10)] = unescapeXml(match[2]);
          }
          if (pieces.length === 0) return [unescapeXml(result)];
          return Array.from(pieces, piece => piece ?? "");
        }, null, function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
          const body = {
            text: requests.map(info => info.originalText),
            target_lang: toDeeplTargetLanguage(targetLanguage),
            tag_handling: "xml",
            outline_detection: false
          };
          const source = toDeeplSourceLanguage(sourceLanguage);
          if (source) body.source_lang = source;
          return JSON.stringify(body);
        }, function cbGetExtraHeaders() {
          return [{
            name: "Content-Type",
            value: "application/json"
          }, {
            name: "Authorization",
            value: "DeepL-Auth-Key " + apiKey.trim()
          }];
        });
      }

      /**
       * DeepL accepts at most 50 texts per request, so long batches are split.
       * @param {string} sourceLanguage
       * @param {string} targetLanguage
       * @param {Array<TranslationInfo>} requests
       */
      async makeRequest(sourceLanguage, targetLanguage, requests) {
        const translations = [];
        for (let i = 0; i < requests.length; i += DEEPL_MAX_TEXTS_PER_REQUEST) {
          const response = await super.makeRequest(sourceLanguage, targetLanguage, requests.slice(i, i + DEEPL_MAX_TEXTS_PER_REQUEST));
          if (!response || !Array.isArray(response.translations)) {
            throw new Error("DeepL error: " + (response && (response.message || response.detail) || "unexpected response"));
          }
          translations.push(...response.translations);
        }
        return {
          translations
        };
      }
    }();
  };

  /** @type {Service|null} */
  let deeplService = null;
  /** @type {string} */
  let deeplServiceKey = "";
  /**
   * Returns the DeepL service for the API key saved in the settings.
   * A new service is created whenever the key changes.
   * @returns {Service|null}
   */
  const getDeeplService = () => {
    const apiKey = (twpConfig.get("deeplApiKey") || "").trim();
    if (!apiKey) return null;
    if (!deeplService || deeplServiceKey !== apiKey) {
      deeplService = createDeeplService(apiKey);
      deeplServiceKey = apiKey;
    }
    return deeplService;
  };

  /**
   * Groq (AI, OpenAI-compatible chat API). Each user adds their own key, so the text goes to Groq with that key only.
   * Texts use the same <x id="n"> segments as DeepL, so a result can be split back into the pieces it came from.
   */
  const groqLanguageName = code => {
    try {
      return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
    } catch (e) {
      return code;
    }
  };
  /**
   * @param {string} apiKey
   * @param {string} model
   * @returns {Service}
   */
  const createGroqService = (apiKey, model) => {
    return new class extends Service {
      constructor() {
        // One request = all text pieces of one element, as a JSON array (so the pieces keep their order and count).
        super("groq", "https://api.groq.com/openai/v1/chat/completions", "POST", function cbTransformRequest(sourceArray) {
          return JSON.stringify(sourceArray);
        }, function cbParseResponse(response) {
          return response.translations.map( /** @return {Service_Single_Result_Response} */pieces => ({
            text: JSON.stringify(pieces),
            detectedLanguage: "und"
          }));
        }, function cbTransformResponse(result, dontSortResults) {
          if (typeof result !== "string") throw new Error("Groq: no translation for this text");
          return JSON.parse(result);
        }, null, function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
          const source = sourceLanguage && sourceLanguage !== "auto" && sourceLanguage !== "und" ? ` The source language is ${groqLanguageName(sourceLanguage)}.` : "";
          const instruction = `You translate website text into ${groqLanguageName(targetLanguage)}.${source} ` +
            "The user message is a JSON array. Each item is an array of text strings taken from one part of a web page. " +
            "Translate every string. Keep HTML-like tags, numbers, URLs and line breaks as they are, and do not add notes. " +
            "Reply with a JSON object {\"translations\": [...]}. It must have one item per input item, in the same order, " +
            "and each item must be an array of translated strings with the same length and order as its input array.";
          return JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [{ role: "system", content: instruction }, { role: "user", content: JSON.stringify(requests.map(info => JSON.parse(info.originalText))) }]
          });
        }, function cbGetExtraHeaders() {
          return [{
            name: "Content-Type",
            value: "application/json"
          }, {
            name: "Authorization",
            value: "Bearer " + apiKey.trim()
          }];
        });
      }

      /**
       * Sends one batch. The answer must have one array per request, with the same number of pieces as its input.
       * @param {string} sourceLanguage
       * @param {string} targetLanguage
       * @param {Array<TranslationInfo>} requests
       */
      async makeRequest(sourceLanguage, targetLanguage, requests) {
        const response = await super.makeRequest(sourceLanguage, targetLanguage, requests);
        recordGroqUsage(response && response.usage);
        const content = response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        let parsed = null;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          parsed = null;
        }
        const inputs = requests.map(info => JSON.parse(info.originalText));
        const valid = parsed && Array.isArray(parsed.translations) && parsed.translations.length === inputs.length && parsed.translations.every((pieces, i) => Array.isArray(pieces) && pieces.length === inputs[i].length);
        if (!valid) {
          const message = response && response.error && response.error.message;
          throw new Error("Groq error: " + (message || "the answer did not match the request"));
        }
        return {
          translations: parsed.translations.map(pieces => pieces.map(text => String(text)))
        };
      }
    }();
  };

  /** @type {Service|null} */
  let groqService = null;
  /** @type {string} */
  let groqServiceKey = "";
  /**
   * Returns the Groq service for the key and model saved in the settings. A new service is made when either changes.
   * @returns {Service|null}
   */
  const getGroqService = () => {
    const apiKey = (twpConfig.get("groqApiKey") || "").trim();
    if (!apiKey) return null;
    const model = (twpConfig.get("groqModel") || "openai/gpt-oss-20b").trim();
    const key = apiKey + "\n" + model;
    if (!groqService || groqServiceKey !== key) {
      groqService = createGroqService(apiKey, model);
      groqServiceKey = key;
    }
    return groqService;
  };

  /**
   * OpenRouter (AI): one API for many models, with an OpenAI-compatible chat API. Each user adds their own key, so the
   * text goes to OpenRouter with that key, and from there to the model the user chose. Like Groq, one batch of texts is
   * one request, and the answer must have the same shape as the request (see makeRequest). The request asks for a JSON
   * schema (structured output). provider.require_parameters sends it only to a provider that supports that.
   * Groq's language names and instruction are used, so both services translate the same way.
   */
  const openRouterSchema = {
    type: "object",
    properties: {
      translations: { type: "array", items: { type: "array", items: { type: "string" } } }
    },
    required: ["translations"],
    additionalProperties: false
  };
  /**
   * @param {string} apiKey
   * @param {string} model
   * @returns {Service}
   */
  const createOpenRouterService = (apiKey, model) => {
    return new class extends Service {
      constructor() {
        super("openrouter", "https://openrouter.ai/api/v1/chat/completions", "POST", function cbTransformRequest(sourceArray) {
          return JSON.stringify(sourceArray);
        }, function cbParseResponse(response) {
          return response.translations.map( /** @return {Service_Single_Result_Response} */pieces => ({
            text: JSON.stringify(pieces),
            detectedLanguage: "und"
          }));
        }, function cbTransformResponse(result, dontSortResults) {
          if (typeof result !== "string") throw new Error("OpenRouter: no translation for this text");
          return JSON.parse(result);
        }, null, function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
          const source = sourceLanguage && sourceLanguage !== "auto" && sourceLanguage !== "und" ? ` The source language is ${groqLanguageName(sourceLanguage)}.` : "";
          const instruction = `You translate website text into ${groqLanguageName(targetLanguage)}.${source} ` +
            "The user message is a JSON array. Each item is an array of text strings taken from one part of a web page. " +
            "Translate every string. Keep HTML-like tags, numbers, URLs and line breaks as they are, and do not add notes. " +
            "Reply with a JSON object {\"translations\": [...]}. It must have one item per input item, in the same order, " +
            "and each item must be an array of translated strings with the same length and order as its input array.";
          return JSON.stringify({
            model,
            temperature: 0,
            provider: { require_parameters: true },
            response_format: { type: "json_schema", json_schema: { name: "translations", strict: true, schema: openRouterSchema } },
            messages: [{ role: "system", content: instruction }, { role: "user", content: JSON.stringify(requests.map(info => JSON.parse(info.originalText))) }]
          });
        }, function cbGetExtraHeaders() {
          return [{
            name: "Content-Type",
            value: "application/json"
          }, {
            name: "Authorization",
            value: "Bearer " + apiKey.trim()
          }, {
            // Names the app on OpenRouter's usage pages. It is not a secret.
            name: "X-Title",
            value: "Atlas Translation"
          }];
        });
      }

      /**
       * Sends one batch. The answer must have one array per request, with the same number of pieces as its input.
       * @param {string} sourceLanguage
       * @param {string} targetLanguage
       * @param {Array<TranslationInfo>} requests
       */
      async makeRequest(sourceLanguage, targetLanguage, requests) {
        const response = await super.makeRequest(sourceLanguage, targetLanguage, requests);
        const content = response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        let parsed = null;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          parsed = null;
        }
        const inputs = requests.map(info => JSON.parse(info.originalText));
        const valid = parsed && Array.isArray(parsed.translations) && parsed.translations.length === inputs.length && parsed.translations.every((pieces, i) => Array.isArray(pieces) && pieces.length === inputs[i].length);
        if (!valid) {
          const message = response && response.error && response.error.message;
          throw new Error("OpenRouter error: " + (message || "the answer did not match the request"));
        }
        return {
          translations: parsed.translations.map(pieces => pieces.map(text => String(text)))
        };
      }
    }();
  };

  /** @type {Service|null} */
  let openRouterService = null;
  /** @type {string} */
  let openRouterServiceKey = "";
  /**
   * Returns the OpenRouter service for the key and model saved in the settings. A new service is made when either changes.
   * @returns {Service|null}
   */
  const getOpenRouterService = () => {
    const apiKey = (twpConfig.get("openRouterApiKey") || "").trim();
    if (!apiKey) return null;
    const model = (twpConfig.get("openRouterModel") || "openai/gpt-4o-mini").trim();
    const key = apiKey + "\n" + model;
    if (!openRouterService || openRouterServiceKey !== key) {
      openRouterService = createOpenRouterService(apiKey, model);
      openRouterServiceKey = key;
    }
    return openRouterService;
  };

  /**
   * Creates the libreTranslate translation service from URL and apiKey
   * @param {string} url
   * @param {string} apiKey
   * @returns {Service} libreService
   */
  const createLibreService = (url, apiKey) => {
    return new class extends Service {
      constructor() {
        super("libre", url, "POST", function cbTransformRequest(sourceArray) {
          return sourceArray[0];
        }, function cbParseResponse(response) {
          return [{
            text: response.translatedText,
            detectedLanguage: response.detectedLanguage.language
          }];
        }, function cbTransformResponse(result, dontSortResults) {
          return [result];
        }, null, function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
          const params = new URLSearchParams();
          params.append("q", requests[0].originalText);
          params.append("source", sourceLanguage);
          params.append("target", targetLanguage);
          params.append("format", "text");
          // Many LibreTranslate servers need no key. The key is sent only when one is saved.
          if (apiKey) params.append("api_key", apiKey);
          return params.toString();
        }, function cbGetExtraHeaders() {
          return [{
            name: "Content-Type",
            value: "application/x-www-form-urlencoded"
          }];
        });
      }

      /**
       * LibreTranslate takes one text per request, so a batch of page texts is split into one request per text.
       * Without this, only the first text of a batch would be sent.
       * @param {string} sourceLanguage
       * @param {string} targetLanguage
       * @param {Array<string[]>} sourceArray2d
       * @returns {Promise<[Array<TranslationInfo[]>, TranslationInfo[]]>}
       */
      async getRequests(sourceLanguage, targetLanguage, sourceArray2d) {
        const [batches, inProgress] = await super.getRequests(sourceLanguage, targetLanguage, sourceArray2d);
        return [batches.flatMap(batch => batch.map(info => [info])), inProgress];
      }

      /**
       *
       * @param {string} sourceLanguage - This parameter is not used
       * @param {*} targetLanguage
       * @param {*} sourceArray2d - Only the string `sourceArray2d[0][0]` will be translated.
       * @param {*} dontSaveInPersistentCache - This parameter is not used
       * @param {*} dontSortResults - This parameter is not used
       * @returns
       */
      /*
      async translate(
        sourceLanguage,
        targetLanguage,
        sourceArray2d,
        dontSaveInPersistentCache,
        dontSortResults = false
      ) {
      }
      //*/
    }();
  };

  /**
   * Offline (desktop helper). The Atlas Helper runs an offline engine (Mozilla's Bergamot models) on this computer and
   * serves it on 127.0.0.1 (see tools/atlas-updater/src/api.rs). The helper needs this browser bound to it (Options, Offline).
   */
  const OFFLINE_HELPER_URL = "http://127.0.0.1:47632";
  // The helper API version this extension needs (PROTOCOL in tools/atlas-updater/src/api.rs). An older helper is not used:
  // the next enabled service translates instead, and the options page says to update the helper.
  const OFFLINE_PROTOCOL = 2;
  const OFFLINE_MAX_TEXTS_PER_REQUEST = 500;
  const OFFLINE_PACKS_CACHE_MS = 10000;
  /** @type {{at: number, pairs: string[]}|null} */
  let offlinePacksCache = null;

  /**
   * A service that cannot take this request is not broken, so it does not count as a failure (see serviceHealth.js).
   * @param {string} message
   */
  function offlineUnavailable(message) {
    const error = new Error("offline: " + message);
    error.notAFailure = true;
    return error;
  }

  /**
   * The pack pair for a translation, such as "enfr" or "fren". Null when no offline pack translates it.
   * @param {string} sourceLanguage
   * @param {string} targetLanguage
   * @returns {string|null}
   */
  function offlinePair(sourceLanguage, targetLanguage) {
    const from = String(sourceLanguage || "");
    const to = String(targetLanguage || "");
    const languages = twpLang.SupportedLanguages.offline;
    if (from === to || !languages.includes(from) || !languages.includes(to)) return null;
    if (from !== "en" && to !== "en") return null;
    return from + to;
  }

  /**
   * The language packs the helper has installed, and whether its engine is there. Asked at most every few seconds.
   * @returns {Promise<{pairs: string[], engine: boolean}>}
   */
  async function getOfflinePacks() {
    if (offlinePacksCache && Date.now() - offlinePacksCache.at < OFFLINE_PACKS_CACHE_MS) return offlinePacksCache;
    const response = await fetchWithTimeout(OFFLINE_HELPER_URL + "/api/offline/ping", {}, 3000);
    const body = await response.json();
    if (!body || !body.ok) throw new Error("offline: the helper did not answer");
    // protocol and features are read when present. A helper that has neither is an older one (protocol 1).
    offlinePacksCache = {
      at: Date.now(),
      pairs: Array.isArray(body.packs) ? body.packs : [],
      engine: body.engine === true,
      protocol: Number(body.protocol) || 1,
      version: typeof body.version === "string" ? body.version : "",
      features: Array.isArray(body.features) ? body.features : []
    };
    return offlinePacksCache;
  }

  /**
   * Creates the Offline (desktop helper) service. A missing helper, engine, pack or binding makes it skip the text
   * (see offlineUnavailable), and the next enabled service that supports the language translates instead.
   * @returns {Service}
   */
  const createOfflineService = () => {
    return new class extends Service {
      constructor() {
        super("offline", OFFLINE_HELPER_URL + "/api/offline/translate", "POST", function cbTransformRequest(sourceArray) {
          // translate() sends one piece per request, so there is one entry in the array here.
          return sourceArray[0];
        }, function cbParseResponse(response) {
          return response.translations.map(text => ({ text, detectedLanguage: response.detectedLanguage }));
        }, function cbTransformResponse(result) {
          return [result];
        }, null, null, null);
      }

      /**
       * Each piece of text is translated on its own, so the results keep the shape of sourceArray2d.
       * @param {string} sourceLanguage
       * @param {string} targetLanguage
       * @param {Array<string[]>} sourceArray2d
       * @param {boolean} dontSaveInPersistentCache
       * @param {boolean} dontSortResults
       * @returns {Promise<string[][]>}
       */
      async translate(sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache = false, dontSortResults = false) {
        const pair = offlinePair(sourceLanguage, targetLanguage);
        if (!pair) throw offlineUnavailable(`no language pack translates ${sourceLanguage} to ${targetLanguage}`);
        const packs = await getOfflinePacks();
        if (packs.protocol < OFFLINE_PROTOCOL) throw offlineUnavailable("please update the Atlas Helper to the newest version, then try again.");
        if (!packs.engine) throw offlineUnavailable("please install the offline engine in the Atlas Helper (Offline tab).");
        if (!packs.pairs.includes(pair)) throw offlineUnavailable(`please install the ${pair} language pack in the Atlas Helper (Offline tab).`);
        if (!(twpConfig.get("offlineHelperToken") || "").trim()) throw offlineUnavailable("please connect this browser to the Atlas Helper in the Offline settings.");
        const pieces = [];
        for (const sourceArray of sourceArray2d) {
          for (const text of sourceArray) pieces.push([text]);
        }
        const results = await super.translate(sourceLanguage, targetLanguage, pieces, dontSaveInPersistentCache, dontSortResults);
        let next = 0;
        return sourceArray2d.map(sourceArray => sourceArray.map(() => results[next++][0]));
      }

      /**
       * Sends one batch of texts to the helper. The helper checks the binding token and the pack.
       * @param {string} sourceLanguage
       * @param {string} targetLanguage
       * @param {Array<TranslationInfo>} requests
       */
      async makeRequest(sourceLanguage, targetLanguage, requests) {
        const token = (twpConfig.get("offlineHelperToken") || "").trim();
        const pair = offlinePair(sourceLanguage, targetLanguage);
        const translations = [];
        for (let i = 0; i < requests.length; i += OFFLINE_MAX_TEXTS_PER_REQUEST) {
          const texts = requests.slice(i, i + OFFLINE_MAX_TEXTS_PER_REQUEST).map(info => info.originalText);
          const response = await fetchWithTimeout(this.baseURL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ pair, texts })
          }, 60000);
          const body = await response.json().catch(() => null);
          if (!response.ok || !body || !Array.isArray(body.translations)) {
            const message = (body && body.message) || "HTTP " + response.status;
            if (response.status === 403) throw offlineUnavailable("this browser is not bound to the helper. " + message);
            throw new Error("offline: " + message);
          }
          translations.push(...body.translations);
        }
        return { translations, detectedLanguage: sourceLanguage };
      }
    }();
  };

  /** @type {Map<string, Service>} */
  const serviceList = new Map();
  serviceList.set("google", googleService);
  serviceList.set("yandex", yandexService);
  serviceList.set("bing", bingService);
  serviceList.set("offline", createOfflineService());

  /**
   * Get translation service from your name
   * Make sure the service is enabled
   * @param {string} serviceName
   * @returns {Service} service
   */
  const getSafeServiceByName = serviceName => {
    if (twpConfig.get("enabledServices").includes(serviceName) || twpConfig.get("customServices").find(cs => cs.name === serviceName)) {
      if (serviceName === "deepl") return getDeeplService();
      if (serviceName === "groq") return getGroqService();
      if (serviceName === "openrouter") return getOpenRouterService();
      return serviceList.get(serviceName);
    } else {
      return null;
    }
  };
  /**
   * The services to try for one request, in order: the service the user chose (or its language alternative), then the
   * other enabled services that support the language. A service that does not support the language is never tried.
   * @param {string} serviceName
   * @param {string} targetLanguage
   * @param {boolean} forPageTranslation
   * @returns {string[]}
   */
  function serviceCandidates(serviceName, targetLanguage, forPageTranslation) {
    const enabled = () => twpConfig.get("enabledServices") || [];
    const customServices = () => twpConfig.get("customServices") || [];
    const names = [];
    const first = twpLang.getAlternativeService(targetLanguage, serviceName, forPageTranslation);
    if (first && (enabled().includes(first) || customServices().find(cs => cs.name === first))) names.push(first);
    for (const name of enabled()) {
      if (names.includes(name)) continue;
      // Only a service that supports the language itself (not one of its alternatives) is a fallback.
      if (twpLang.getAlternativeService(targetLanguage, name, forPageTranslation) !== name) continue;
      names.push(name);
    }
    return names;
  }
  const serviceHealth = createServiceHealth();
  /**
   * Translates with the first service in serviceCandidates that works. Failures are recorded (see serviceHealth.js).
   * @param {string} serviceName
   * @param {string} targetLanguage
   * @param {boolean} forPageTranslation
   * @param {(service: Service) => Promise<*>} translateWith
   * @param {((error: unknown) => void)|null} onCaptcha called for each captcha challenge, even when another service then works
   */
  function translateWithFallback(serviceName, targetLanguage, forPageTranslation, translateWith, onCaptcha) {
    const candidates = serviceCandidates(serviceName, targetLanguage, forPageTranslation);
    return runWithServiceFallback(
      candidates,
      serviceHealth,
      name => translateWith(getSafeServiceByName(name)),
      (error, name) => {
        console.warn(`Translation with ${name} failed. Trying the next service.`);
        if (error instanceof ServiceCaptchaError && onCaptcha) onCaptcha(error);
      }
    ).then(({ result, service }) => {
      if (service !== candidates[0]) console.info(`Translated with ${service} because ${candidates[0]} is not working.`);
      return result;
    });
  }
  translationService.translateHTML = async (serviceName, sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache = false, dontSortResults = false, onCaptcha = null) => {
    return await translateWithFallback(serviceName, targetLanguage, true,
      service => service.translate(sourceLanguage, targetLanguage, sourceArray2d, dontSaveInPersistentCache, dontSortResults),
      onCaptcha);
  };
  translationService.translateText = async (serviceName, sourceLanguage, targetLanguage, sourceArray, dontSaveInPersistentCache = false) => {
    return await translateWithFallback(serviceName, targetLanguage, false,
      async service => (await service.translate(sourceLanguage, targetLanguage, sourceArray.map(text => [text]), dontSaveInPersistentCache)).map(result => result[0]),
      null);
  };
  // Translates with this one service only. When it fails, no other service is tried: the PDF translator uses this so
  // that its text stays on this computer (the offline helper).
  translationService.translateTextOnly = async (serviceName, sourceLanguage, targetLanguage, sourceArray, dontSaveInPersistentCache = false) => {
    const service = getSafeServiceByName(serviceName);
    return (await service.translate(sourceLanguage, targetLanguage, sourceArray.map(text => [text]), dontSaveInPersistentCache)).map(result => result[0]);
  };
  translationService.translateSingleText = async (serviceName, sourceLanguage, targetLanguage, originalText, dontSaveInPersistentCache = false) => {
    return await translateWithFallback(serviceName, targetLanguage, false,
      async service => (await service.translate(sourceLanguage, targetLanguage, [[originalText]], dontSaveInPersistentCache))[0][0],
      null);
  };
  /**
   * Adds the tokens of one Groq answer to the running total the popup shows. The total is approximate:
   * it only counts answers that came back while this extension was running, and two answers at the same moment can add up slightly wrong.
   * @param {{total_tokens?: number}|undefined} usage the "usage" block of a Groq chat answer
   */
  function recordGroqUsage(usage) {
    const tokens = usage ? Number(usage.total_tokens) : 0;
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    chrome.storage.local.get("groqUsage", result => {
      const current = (result && result.groqUsage) || { tokens: 0, requests: 0, since: Date.now() };
      chrome.storage.local.set({ groqUsage: { tokens: current.tokens + tokens, requests: current.requests + 1, since: current.since } });
    });
  }
  /**
   * DeepL quota for the saved key: characters used and the plan limit (GET /v2/usage).
   * @returns {Promise<{used?: number, limit?: number, error?: string}>}
   */
  async function getDeeplUsage() {
    const apiKey = (twpConfig.get("deeplApiKey") || "").trim();
    if (!apiKey) return { error: "no-key" };
    const response = await fetchWithTimeout(getDeeplBaseURL(apiKey) + "/v2/usage", { headers: { Authorization: "DeepL-Auth-Key " + apiKey } });
    if (!response.ok) return { error: "http-" + response.status };
    const data = await response.json();
    return { used: data.character_count, limit: data.character_limit };
  }
  /**
   * Approximate Groq token total counted from the answers (see recordGroqUsage).
   * @returns {Promise<{tokens: number, requests: number, since: number|null}>}
   */
  function getGroqUsage() {
    return new Promise(resolve => {
      chrome.storage.local.get("groqUsage", result => {
        const current = (result && result.groqUsage) || { tokens: 0, requests: 0, since: null };
        resolve({ tokens: current.tokens, requests: current.requests, since: current.since });
      });
    });
  }

  // A Yandex captcha is shown on the page that asked for the translation, so the user can solve it there.
  function notifyCaptchaRequired(e, sender) {
    if (!(e instanceof ServiceCaptchaError) || !sender || !sender.tab) return;
    twpSendToTab((sender.tab || {}).id, { action: "translationCaptcha", serviceName: e.serviceName, captchaUrl: e.captchaUrl }, () => void chrome.runtime.lastError);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // If the translation request came from an incognito window, the translation should not be cached on disk.
    let dontSaveInPersistentCache = true;
    if (twpConfig.get("enableDiskCache") !== "yes") {
      dontSaveInPersistentCache = true;
    } else {
      dontSaveInPersistentCache = sender.tab ? sender.tab.incognito : false;
    }
    if (request.action === "translateHTML") {
      translationService.translateHTML(request.translationService, request.sourceLanguage, request.targetLanguage, request.sourceArray2d, dontSaveInPersistentCache, request.dontSortResults, error => notifyCaptchaRequired(error, sender)).then(results => sendResponse(results)).catch(e => {
        sendResponse();
        console.error(e);
      });
      return true;
    } else if (request.action === "translateText") {
      translationService.translateText(request.translationService, request.sourceLanguage, request.targetLanguage, request.sourceArray, dontSaveInPersistentCache).then(results => sendResponse(results)).catch(e => {
        sendResponse();
        console.error(e);
      });
      return true;
    } else if (request.action === "translateTextOnly") {
      translationService.translateTextOnly(request.translationService, request.sourceLanguage, request.targetLanguage, request.sourceArray, dontSaveInPersistentCache).then(results => sendResponse({ results })).catch(e => {
        sendResponse({ error: String(e && e.message ? e.message : e) });
        console.error(e);
      });
      return true;
    } else if (request.action === "translateSingleText") {
      translationService.translateSingleText(request.translationService, request.sourceLanguage, request.targetLanguage, request.source, dontSaveInPersistentCache).then(results => sendResponse(results)).catch(e => {
        sendResponse();
        console.error(e);
      });
      return true;
    } else if (request.action === "getServiceUsage") {
      const usage = request.service === "deepl" ? getDeeplUsage() : request.service === "groq" ? getGroqUsage() : Promise.resolve({ error: "not-supported" });
      usage.then(result => sendResponse(result)).catch(e => sendResponse({ error: String((e && e.message) || e) }));
      return true;
    } else if (request.action === "removeTranslationsWithError") {
      serviceList.forEach(service => {
        if (service.removeTranslationsWithError) {
          service.removeTranslationsWithError();
        }
      });
      if (deeplService) deeplService.removeTranslationsWithError();
      if (groqService) groqService.removeTranslationsWithError();
      if (openRouterService) openRouterService.removeTranslationsWithError();
    } else if (request.action === "createLibreService") {
      serviceList.set("libre", createLibreService(request.libre.url, request.libre.apiKey));
    } else if (request.action === "removeLibreService") {
      serviceList.delete("libre");
    }
  });
  twpConfig.onReady(function () {
    if (twpConfig.get("customServices").find(cs => cs.name === "libre")) {
      const libre = twpConfig.get("customServices").find(cs => cs.name === "libre");
      serviceList.set("libre", createLibreService(libre.url, libre.apiKey));
    }
  });
  return translationService;
}();
