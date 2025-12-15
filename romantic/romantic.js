// Romantic (肉漫屋) module - IComicModule compatible (like wax)
var BASE = "https://rouman5.com";

/**
 * 获取请求头
 */
async function getHeaders() {
    var headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ1A.230305.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    };
    
    return headers;
}

/**
 * HTTP GET 请求
 */
async function httpGet(url) {
    console.log('[romantic] httpGet called with url:', url);
    var headers = await getHeaders();
    console.log('[romantic] headers prepared:', JSON.stringify(headers));
    var response = await runtime.http.get(url, headers);
    console.log('[romantic] response received, status:', response.status, 'body length:', (response.body || '').length);
    
    if (response.status !== 200) {
        console.log('[romantic] HTTP error:', response.status, 'for url:', url);
        throw new Error('HTTP error: ' + response.status);
    }
    
    console.log('[romantic] GET success', url, 'status', response.status);
    return response.body;
}

function fixUrl(url) {
  if (!url) return "";
  url = url.replace(/^\/\/+/, "//");
  // Remove trailing backslashes and other escape characters
  url = url.replace(/[\\\s]+$/, '');
  // Remove any trailing quotes, braces, or other unwanted characters
  url = url.replace(/["'}\\]*$/, '');
  // Remove any remaining trailing backslashes
  url = url.replace(/\\+$/, '');
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

function toRemoteImageInfo(url) {
  if (!url || url === '') {
    return { original_name: "", path: "", file_server: "", headers: {} };
  }
  // Clean URL: remove trailing backslashes, whitespace, and escape characters
  // More aggressive cleaning: remove all trailing backslashes, escape sequences, and whitespace
  var cleanedUrl = url.trim();
  // Remove trailing backslashes (including escaped ones) and whitespace
  cleanedUrl = cleanedUrl.replace(/[\\\s]+$/, '');
  // Also remove any trailing quotes, braces, or other unwanted characters
  cleanedUrl = cleanedUrl.replace(/["'}\\]*$/, '');
  // Remove any remaining trailing backslashes after the above
  cleanedUrl = cleanedUrl.replace(/\\+$/, '');
  const u = fixUrl(cleanedUrl);
  console.log('[romantic] toRemoteImageInfo: input=', url, 'output=', u);
  // For full URLs, put the entire URL in path, file_server should be empty
  return { original_name: "", path: u, file_server: "", headers: {} };
}

function toComicSimple(item) {
  return {
    id: item.id,
    title: item.title || item.id,
    author: "",
    pages_count: 0,
    eps_count: 1,
    finished: true,
    categories: [],
    thumb: toRemoteImageInfo(item.cover || ""),
    likes_count: 0,
  };
}

function toComicDetail(detail) {
  return {
    id: detail.id,
    title: detail.title || detail.id,
    author: detail.author || "",
    pages_count: 0,
    eps_count: 1,
    finished: true,
    categories: detail.labels || [],
    thumb: toRemoteImageInfo(detail.cover || ""),
    likes_count: 0,
    description: detail.description || "",
    chinese_team: "",
    tags: detail.tags || [],
    updated_at: "",
    created_at: "",
    allow_download: true,
    views_count: 0,
    is_favourite: false,
    is_liked: false,
    comments_count: 0,
  };
}

async function listLatest(page) {
    console.log('[romantic] listLatest called with page:', page);
    // Site uses infinite list under /books; support continued=true for latest
    // Backend pagination starts from 0, but frontend sends page starting from 1
    var backendPage = page > 0 ? page - 1 : 0;
    var url = BASE + '/books?continued=true&page=' + backendPage;
    console.log('[romantic] fetching latest comics from:', url);
    var html = await httpGet(url);
    console.log('[romantic] HTML received, length:', html.length);
    var doc = runtime.html.parse(html);
    var items = [];
    // Cards likely anchor to /books/{id}
    var links = doc.querySelectorAll('a[href^="/books/"]');
    console.log('[romantic] found', links.length, 'links with /books/ href');
    for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var href = a.getAttribute('href');
        if (!href || /\/books\/[A-Za-z0-9]+\/.*/.test(href)) {
            if (href) console.log('[romantic] skipping reader link:', href);
            continue; // skip reader links
        }
        var titleNode = a.querySelector('.line-clamp-2, .text-foreground, h3, h2');
        var title = titleNode ? titleNode.textContent.trim() : (a.textContent || '').trim();
        // Try cover from CSS background-image first, then <img> tag
        var cover = null;
        // Look for div with bg-cover class (this is the cover image container)
        var coverDiv = a.querySelector('div.bg-cover, div[class*="bg-cover"]');
        if (coverDiv) {
            var style = coverDiv.getAttribute('style') || '';
            console.log('[romantic] found bg-cover div, style:', style);
            // Extract URL from background-image:url("...") or background-image:url('...')
            // Handle both regular quotes and HTML entities like &quot;
            // Match: url("..."), url('...'), url(...), or url(&quot;...&quot;)
            var match = style.match(/background-image\s*:\s*url\(([^)]+)\)/i);
            if (match && match[1]) {
                cover = match[1].trim();
                // Remove surrounding quotes if present
                cover = cover.replace(/^["']|["']$/g, '');
                // Decode HTML entities
                cover = cover.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
                console.log('[romantic] found cover from background-image:', cover);
            } else {
                console.log('[romantic] bg-cover div found but no background-image URL in style');
            }
        } else {
            console.log('[romantic] no bg-cover div found in link');
        }
        // Fallback to <img> tag if no background-image found
        if (!cover) {
            var img = a.querySelector('img');
            if (img) {
                // Try src first, then data-src, data-original, etc.
                cover = img.getAttribute('src') || 
                        img.getAttribute('data-src') || 
                        img.getAttribute('data-original') ||
                        img.getAttribute('data-lazy-src') ||
                        img.getAttribute('data-url');
                console.log('[romantic] found img element, src:', img.getAttribute('src'), 'data-src:', img.getAttribute('data-src'), 'cover:', cover);
            } else {
                console.log('[romantic] no img element found in link for:', title);
            }
        }
        // Normalize cover URL
        if (cover) {
            cover = cover.trim();
            // Handle protocol-relative URLs
            if (cover.startsWith('//')) {
                cover = 'https:' + cover;
            }
            // Handle absolute URLs
            else if (cover.indexOf('http') === 0) {
                // Already absolute, keep as is
            }
            // Handle relative URLs
            else if (cover.startsWith('/')) {
                cover = BASE + cover;
            }
            // Handle relative URLs without leading slash
            else {
                cover = BASE + '/' + cover;
            }
            console.log('[romantic] normalized cover URL for', title, ':', cover);
        } else {
            console.log('[romantic] no cover URL extracted for:', title);
        }
        var item = {
            id: href.replace('/books/', ''),
            title: title,
            cover: cover,
            url: BASE + href
        };
        console.log('[romantic] parsed item:', JSON.stringify(item));
        items.push(item);
    }
    console.log('[romantic] listLatest page', page, 'items', items.length);
    return items;
}

async function listSearch(keyword, page) {
    console.log('[romantic] listSearch called with keyword:', keyword, 'page:', page);
    // Backend pagination starts from 0, but frontend sends page starting from 1
    var backendPage = page > 0 ? page - 1 : 0;
    var url = BASE + '/search?term=' + encodeURIComponent(keyword) + '&page=' + backendPage;
    var html = await httpGet(url);
    var doc = runtime.html.parse(html);
    var items = [];
    var links = doc.querySelectorAll('a[href^="/books/"]');
    for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var href = a.getAttribute('href');
        if (!href || /\/books\/[A-Za-z0-9]+\/.*/.test(href)) continue;
        var titleNode = a.querySelector('.line-clamp-2, .text-foreground, h3, h2');
        var title = titleNode ? titleNode.textContent.trim() : (a.textContent || '').trim();
        // Try cover from CSS background-image first, then <img> tag
        var cover = null;
        // Look for div with background-image in style attribute
        var coverDiv = a.querySelector('div[style*="background-image"]');
        if (coverDiv) {
            var style = coverDiv.getAttribute('style') || '';
            // Extract URL from background-image:url("...") or background-image:url('...')
            var match = style.match(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i);
            if (match && match[1]) {
                cover = match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                console.log('[romantic] found cover from background-image:', cover);
            }
        }
        // Fallback to <img> tag if no background-image found
        if (!cover) {
            var img = a.querySelector('img');
            if (img) {
                // Try src first, then data-src, data-original, etc.
                cover = img.getAttribute('src') || 
                        img.getAttribute('data-src') || 
                        img.getAttribute('data-original') ||
                        img.getAttribute('data-lazy-src') ||
                        img.getAttribute('data-url');
                console.log('[romantic] found img element, src:', img.getAttribute('src'), 'data-src:', img.getAttribute('data-src'), 'cover:', cover);
            } else {
                console.log('[romantic] no img element found in link for:', title);
            }
        }
        // Normalize cover URL
        if (cover) {
            cover = cover.trim();
            // Handle protocol-relative URLs
            if (cover.startsWith('//')) {
                cover = 'https:' + cover;
            }
            // Handle absolute URLs
            else if (cover.indexOf('http') === 0) {
                // Already absolute, keep as is
            }
            // Handle relative URLs
            else if (cover.startsWith('/')) {
                cover = BASE + cover;
            }
            // Handle relative URLs without leading slash
            else {
                cover = BASE + '/' + cover;
            }
            console.log('[romantic] normalized cover URL for', title, ':', cover);
        } else {
            console.log('[romantic] no cover URL extracted for:', title);
        }
        items.push({
            id: href.replace('/books/', ''),
            title: title,
            cover: cover,
            url: BASE + href
        });
    }
    console.log('[romantic] search', keyword, 'page', page, 'items', items.length);
    return items;
}

async function fetchDetail(id) {
    console.log('[romantic] fetchDetail called with id:', id);
    var url = BASE + '/books/' + id;
    console.log('[romantic] fetching detail from:', url);
    var html = await httpGet(url);
    console.log('[romantic] detail HTML received, length:', html.length);
    var doc = runtime.html.parse(html);
    // 使用更精确的选择器避免匹配网站名称
    var titleNode = doc.querySelector('.text-xl.text-foreground');
    var title = titleNode ? titleNode.textContent.trim() : '';
    console.log('[romantic] parsed title:', title);
    var coverMeta = doc.querySelector('meta[property="og:image"]');
    var cover = coverMeta ? coverMeta.getAttribute('content') : null;
    console.log('[romantic] parsed cover:', cover);
    
    // Extract actual chapter/episode list from page
    // Look for chapter links pattern: /books/{id}/{epIndex}
    var chaptersMap = {}; // Use map to deduplicate
    var chapLinks = doc.querySelectorAll('a[href^="/books/' + id + '/"]');
    console.log('[romantic] found', chapLinks.length, 'chapter links');
    for (var i = 0; i < chapLinks.length; i++) {
        var a = chapLinks[i];
        var href = a.getAttribute('href');
        var m = href && new RegExp('/books/' + id + '/([0-9]+)$').exec(href);
        if (!m) continue;
        var epIndex = parseInt(m[1], 10);
        if (isNaN(epIndex)) continue;
        
        // Try to get chapter name from link text
        var nameNode = a.querySelector('.text-foreground, .line-clamp-1, span, h3, h2');
        var name = nameNode ? nameNode.textContent.trim() : null;
        if (!name || name === '') {
            name = a.textContent.trim();
        }
        if (!name || name === '') {
            name = '第' + (epIndex + 1) + '话';
        }
        
        chaptersMap[epIndex] = {
            epIndex: epIndex,
            name: name,
            url: BASE + href
        };
    }
    
    // Convert map to sorted array
    var chapters = [];
    for (var key in chaptersMap) {
        if (chaptersMap.hasOwnProperty(key)) {
            chapters.push(chaptersMap[key]);
        }
    }
    chapters.sort(function(a, b) { return a.epIndex - b.epIndex; });
    
    console.log('[romantic] detail', id, 'title', title, 'chapters', chapters.length);
    return { id: id, title: title, cover: cover, chapters: chapters };
}

async function fetchImages(id, epIndex) {
    console.log('[romantic] fetchImages called with id:', id, 'epIndex:', epIndex);
    // Reader page: /books/{id}/{epIndex}
    var url = BASE + '/books/' + id + '/' + epIndex;
    console.log('[romantic] fetching images from:', url);
    var html = await httpGet(url);
    console.log('[romantic] images HTML received, length:', html.length);
    var doc = runtime.html.parse(html);
    var imgs = [];
    // Prefer server-rendered imageUrl entries if present; fallback to <img id="image_*">
    var metaImages = [];
    // First, try to find imageUrl in script tags (most reliable)
    var scripts = doc.querySelectorAll('script');
    console.log('[romantic] found', scripts.length, 'script tags');
    for (var j = 0; j < scripts.length; j++) {
        var s = scripts[j];
        var t = s.textContent || '';
        if (!t || t.length < 100) continue; // Skip empty or very short scripts
        
        // Try to find all imageUrl entries and extract URLs
        // Use a more flexible pattern that handles escaped and unescaped quotes
        // Match: imageUrl":"URL" or imageUrl\":\"URL\" or imageUrl: "URL"
        var urlSet = new Set(); // Use Set to avoid duplicates
        
        // Pattern: match imageUrl followed by colon, optional quotes (escaped or not), then URL
        // The URL is captured in group 1, and we match until the closing quote or end of value
        var pattern = /imageUrl(?:\\?["']?\s*:\s*\\?["']?)(https?:\/\/[^"',\s}]+)/g;
        var match;
        
        while ((match = pattern.exec(t)) !== null) {
            if (match[1]) {
                var url = match[1].trim();
                // Remove any trailing characters that might have been captured (quotes, braces, whitespace, backslashes)
                url = url.replace(/[",'}\s\\]+$/, '');
                // Remove any remaining trailing backslashes
                url = url.replace(/\\+$/, '');
                if (url && url.indexOf('http') === 0) {
                    urlSet.add(url);
                }
            }
        }
        
        // If the simple pattern didn't work, try a more specific pattern for JSON strings
        if (urlSet.size === 0) {
            // Pattern for JSON: imageUrl":"URL" or imageUrl\":\"URL\"
            var jsonPattern = /imageUrl(?:\\?"\s*:\s*\\?"|"\s*:\s*")(https?:\/\/[^"]+)/g;
            while ((match = jsonPattern.exec(t)) !== null) {
                if (match[1]) {
                    var url = match[1].trim();
                    // Remove trailing backslashes and escape characters
                    url = url.replace(/[\\\s]+$/, '');
                    // Remove any remaining trailing backslashes and quotes
                    url = url.replace(/["'}\\]*$/, '');
                    url = url.replace(/\\+$/, '');
                    if (url && url.indexOf('http') === 0) {
                        urlSet.add(url);
                    }
                }
            }
        }
        
        if (urlSet.size > 0) {
            console.log('[romantic] script', j, 'found', urlSet.size, 'unique imageUrl matches');
            urlSet.forEach(function(url) {
                metaImages.push(url);
                console.log('[romantic] extracted imageUrl:', url);
            });
        } else {
            // Debug: log a sample of the script content to see what we're working with
            if (t.indexOf('imageUrl') !== -1) {
                var sample = t.substring(t.indexOf('imageUrl'), t.indexOf('imageUrl') + 200);
                console.log('[romantic] script', j, 'contains imageUrl but no matches found. Sample:', sample);
            }
        }
    }
    console.log('[romantic] found', metaImages.length, 'images from script tags');
    // Fallback: try to find img tags in flex justify-center divs
    if (metaImages.length === 0) {
        var nextDataImgs = doc.querySelectorAll('div[class*="flex justify-center"] img');
        console.log('[romantic] found', nextDataImgs.length, 'img tags in flex justify-center divs');
        for (var i = 0; i < nextDataImgs.length; i++) {
            var img = nextDataImgs[i];
            var src = img.getAttribute('src') || img.getAttribute('data-src');
            if (!src || src.indexOf('loading.jpg') >= 0) continue;
            if (src.indexOf('http') !== 0) src = BASE + src;
            metaImages.push(src);
        }
    }
    for (var l = 0; l < metaImages.length; l++) {
        imgs.push({ url: metaImages[l] });
    }
    
    console.log('[romantic] images', id, 'epIndex', epIndex, 'count', imgs.length);
    return imgs;
}

// ============ IComicModule-style exports (like wax) ============
var moduleInfo = {
  id: "romantic",
  name: "肉漫屋",
  version: "0.1.0",
  author: "comics",
  description: "肉漫屋 (rouman5.com) 数据源模块",
  icon: null,
  features: {
    processImage: true
  }
};

async function getCategories() {
  return [{ id: "", title: "全部漫画" }];
}

function getSortOptions() {
  return [{ value: "", name: "默认" }];
}

async function getComics(params) {
    console.log('[romantic] getComics called with params:', JSON.stringify(params));
    var page = params.page || 1;
    var list = await listLatest(page);
    // If no items found, treat as last page (current page is the last page)
    // If items found but less than expected, also treat as last page
    var limit = 20;
    var hasMore = list.length > 0 && list.length >= limit;
    var result = {
        total: list.length,
        limit: limit,
        page: page,
        pages: hasMore ? page + 1 : page, // If has more, next page exists; otherwise current page is last
        docs: list.map(toComicSimple)
    };
    console.log('[romantic] getComics returning:', result.docs.length, 'comics, pages:', result.pages);
    return result;
}

async function getComicDetail(params) {
  var comicId = params.comicId;
  var detail = await fetchDetail(comicId);
  return toComicDetail(detail);
}

async function getEps(params) {
  var comicId = params.comicId;
  console.log('[romantic] getEps called with comicId:', comicId);
  
  var detail = await fetchDetail(comicId);
  var chapters = detail.chapters || [];
  
  // If no chapters found, return a default single episode
  if (chapters.length === 0) {
    console.log('[romantic] no chapters found, returning default episode');
    return {
      total: 1,
      limit: 100,
      page: 1,
      pages: 1,
      docs: [{ id: comicId + '#0', title: "全一话", order: 1, updated_at: "" }]
    };
  }
  
  // Convert chapters to episode format
  // Episode ID format: "comicId#epIndex" (e.g., "cmj1uhc3i001zs6w0yiul0br9#0")
  var docs = chapters.map(function(chapter, idx) {
    return {
      id: comicId + '#' + chapter.epIndex,
      title: chapter.name,
      order: idx + 1,
      updated_at: ''
    };
  });
  
  console.log('[romantic] getEps returning', docs.length, 'episodes');
  return {
    total: docs.length,
    limit: 100,
    page: 1,
    pages: 1,
    docs: docs
  };
}

async function getPictures(params) {
  var epId = params.epId || params.ep_id || '';
  console.log('[romantic] getPictures called with epId:', epId);
  
  // Parse epId format: "comicId#epIndex"
  var parts = epId.split('#');
  if (parts.length !== 2) {
    console.error('[romantic] getPictures invalid epId format:', epId, 'expected "comicId#epIndex"');
    return {
      total: 0,
      limit: 0,
      page: 1,
      pages: 1,
      docs: []
    };
  }
  
  var comicId = parts[0];
  var epIndex = parseInt(parts[1], 10);
  if (isNaN(epIndex)) {
    console.error('[romantic] getPictures invalid epIndex:', parts[1]);
    return {
      total: 0,
      limit: 0,
      page: 1,
      pages: 1,
      docs: []
    };
  }
  
  console.log('[romantic] getPictures fetching images for comicId:', comicId, 'epIndex:', epIndex);

  // Fetch images for this episode/chapter
  var images = await fetchImages(comicId, epIndex);
  
  console.log('[romantic] getPictures found', images.length, 'images for episode', epIndex);
  
  return {
    total: images.length,
    limit: images.length,
    page: 1,
    pages: 1,
    docs: images.map(function (p, idx) {
      var imageUrl = p.url || p;
      var imageName = '';
      // Extract image filename from URL for metadata (used for descrambling)
      // Format: https://.../.../filename.jpg or https://.../.../encoded_filename.jpg#scrambled
      var urlParts = imageUrl.split('/');
      if (urlParts.length > 0) {
        imageName = urlParts[urlParts.length - 1];
      }
      var metadata = {
        imageUrl: imageUrl,
        imageName: imageName
      };
      // add a processing version to invalidate stale caches when algorithm changes
      if (imageUrl && imageUrl.indexOf('sr:1') !== -1) {
        metadata.proc = 'sr1-v2';
      }
      return { 
        id: epId + "_" + idx, 
        media: toRemoteImageInfo(imageUrl),
        metadata: metadata
      };
    })
  };
}

async function search(params) {
  var page = params.page || 1;
  var keyword = params.keyword || "";
  var list = await listSearch(keyword, page);
  // If no items found, treat as last page (current page is the last page)
  // If items found but less than expected, also treat as last page
  var limit = 20;
  var hasMore = list.length > 0 && list.length >= limit;
  return {
    total: list.length,
    limit: limit,
    page: page,
    pages: hasMore ? page + 1 : page, // If has more, next page exists; otherwise current page is last
    docs: list.map(toComicSimple)
  };
}

/**
 * Process image (descramble if needed)
 * 
 * Algorithm from rouman website:
 * - Images ending with #scrambled are scrambled
 * - The filename (without .jpg) is base64 decoded, then MD5 hashed
 * - The last byte of MD5 hash % 10 + 5 gives the number of blocks (5-14)
 * - Image is divided into blocks horizontally
 * - Blocks are reversed: bottom block goes to top, etc.
 * - Remainder height is included in bottom block
 * 
 * @param {Object} args - { imageData: base64, params: { imageUrl, imageName } }
 * @returns {Object} - { imageData: base64 }
 */
async function processImage(args) {
  var imageData = args.imageData;
  var params = args.params || {};
  var imageUrl = params.imageUrl || '';
  var imageName = params.imageName || '';
  
  console.log('[romantic] processImage called, imageUrl:', imageUrl, 'imageName:', imageName);
  
  // New site logic: scrambled images are indicated by `sr:1` in URL
  // Example: .../wm:0/sr:1/.../00001.webp
  var isScrambled = false;
  try {
    isScrambled = !!(imageUrl && imageUrl.indexOf('sr:1') !== -1);
    if (!isScrambled && imageName) {
      var decodedName = imageName;
      try { decodedName = decodeURIComponent(imageName); } catch (e) {}
      if (decodedName.indexOf('sr:1') !== -1) {
        isScrambled = true;
      }
    }
  } catch (e) {}
  if (!isScrambled) {
    console.log('[romantic] processImage: image not scrambled, returning original');
    return { imageData: imageData };
  }
  
  try {
    // Get image info
    console.log('[romantic] processImage: getting image info...');
    var infoJson = runtime.image.getInfo(imageData);
    var info = JSON.parse(infoJson);
    var width = info.width;
    var height = info.height;
    console.log('[romantic] processImage: image size:', width, 'x', height);
    
    // Calculate number of blocks
    // Python demo: filename = image_url.split('/')[-1]; filename_no_ext = '.'.join(filename.split('.')[:-1])
    // Extract last path segment (from URL or imageName), remove extension, convert URL-safe base64
    var b64key = '';
    try {
      var source = imageUrl || imageName || '';
      // Get last path segment
      var segments = source.split('/');
      var lastSeg = segments[segments.length - 1];
      // Remove extension: '.'.join(filename.split('.')[:-1])
      var parts = lastSeg.split('.');
      if (parts.length > 1) {
        parts.pop(); // remove last (extension)
        b64key = parts.join('.');
      } else {
        b64key = lastSeg;
      }
      console.log('[romantic] processImage: extracted filename (no ext):', b64key.substring(0, Math.min(32, b64key.length)), '...');
    } catch (e) {
      console.error('[romantic] processImage: failed to extract b64 key:', e.message);
    }
    
    // URL-safe base64 to standard: replace('-', '+').replace('_', '/')
    b64key = b64key.replace(/-/g, '+').replace(/_/g, '/');
    // fix base64 padding
    var paddingMissing = b64key.length % 4;
    if (paddingMissing) {
      b64key = b64key + '='.repeat(4 - paddingMissing);
    }
    console.log('[romantic] processImage: b64 key ready for decode, len:', b64key.length);
    
    // Base64 decode filename
    var filenameBytes = runtime.crypto.base64Decode(b64key);
    console.log('[romantic] processImage: decoded filename bytes length:', filenameBytes.length);
    
    // MD5 hash (returns hex string, not byte array)
    var md5HashHex = runtime.crypto.md5Bytes(filenameBytes);
    console.log('[romantic] processImage: MD5 hash (hex):', md5HashHex.substring(0, 16), '...');
    
    // Get last byte and calculate blocks (5-14)
    // Python: last_byte = int(md5_hash[-2:], 16)
    // Take last 2 hex chars (= 1 byte), convert to int
    var lastByteHex = md5HashHex.substring(md5HashHex.length - 2);
    var lastByte = parseInt(lastByteHex, 16);
    var blocks = (lastByte % 10) + 5;
    console.log('[romantic] processImage: last byte:', lastByte, 'blocks:', blocks);
    
    // New slicing scheme (per demo):
    // slice_base_height = Math.floor(height / blocks)
    // remainder = height % blocks
    // For each l: p = slice_base_height; y = p * l;
    // d = height - p * (l + 1) - remainder;
    // if l == 0: current_h = p + remainder; else: current_h = p; y += remainder
    var sliceBase = Math.floor(height / blocks);
    var remainder = height % blocks;
    var crops = [];
    for (var l = 0; l < blocks; l++) {
      var p = sliceBase;
      var y = p * l; // destination order
      var d = height - p * (l + 1) - remainder; // source top
      var currentH = (l === 0) ? (p + remainder) : p;
      if (l !== 0) {
        y += remainder;
      }
      // Bound checks
      if (d < 0) d = 0;
      if (d + currentH > height) currentH = height - d;
      console.log('[romantic] processImage: block', l, 'srcY:', d, 'dstOrderY:', y, 'height:', currentH);
      crops.push({ x: 0, y: d, width: width, height: currentH });
    }
    
    // Create descrambled image by composing crops
    var descrambledData = imageData;
    
    // Process crops in sequence, always cropping from the original image
    for (var j = 0; j < crops.length; j++) {
      var crop = crops[j];
      console.log('[romantic] processImage: processing crop', j, '- x:', crop.x, 'y:', crop.y, 'w:', crop.width, 'h:', crop.height);
      
      // Always crop from the original scrambled image
      var croppedData = runtime.image.crop(
        imageData,
        crop.x,
        crop.y,
        crop.width,
        crop.height
      );
      
      if (j === 0) {
        // First block becomes the base
        descrambledData = croppedData;
      } else {
        // Subsequent blocks are composed vertically
        descrambledData = runtime.image.composeVertical([descrambledData, croppedData]);
      }
    }
    
    console.log('[romantic] processImage: descrambling complete');
    return { imageData: descrambledData };
    
  } catch (e) {
    console.error('[romantic] processImage error:', e.message);
    // If descrambling fails, return original image
    return { imageData: imageData };
  }
}

const module = {
  moduleInfo,
  getCategories,
  getSortOptions,
  getComics,
  getComicDetail,
  getEps,
  getPictures,
  search,
  processImage
};

if (typeof exports !== 'undefined') {
  Object.assign(exports, module);
}
