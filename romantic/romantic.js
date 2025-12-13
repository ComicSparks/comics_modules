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
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

function toRemoteImageInfo(url) {
  if (!url || url === '') {
    return { original_name: "", path: "", file_server: "", headers: {} };
  }
  const u = fixUrl(url);
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
    var titleNode = doc.querySelector('h1, .text-2xl, .text-foreground:not(nav *)');
    var title = titleNode ? titleNode.textContent.trim() : '';
    console.log('[romantic] parsed title:', title);
    var coverMeta = doc.querySelector('meta[property="og:image"]');
    var cover = coverMeta ? coverMeta.getAttribute('content') : null;
    console.log('[romantic] parsed cover:', cover);
    // Extract chapters list if present; otherwise create 0..(pages-1) when known.
    var chapters = [];
    var chapLinks = doc.querySelectorAll('a[href^="/books/' + id + '/"]');
    for (var i = 0; i < chapLinks.length; i++) {
        var a = chapLinks[i];
        var href = a.getAttribute('href');
        var m = href && new RegExp('/books/' + id + '/([0-9]+)').exec(href);
        if (!m) continue;
        var idx = parseInt(m[1], 10);
        var nameNode = a.querySelector('.text-foreground, .line-clamp-1, span');
        var name = nameNode ? nameNode.textContent.trim() : '第' + (idx + 1) + '页';
        chapters.push({
            id: '' + idx,
            name: name,
            url: BASE + href
        });
    }
    console.log('[romantic] detail', id, 'title', title, 'chapters', chapters.length);
    return { id: id, title: title, cover: cover, chapters: chapters };
}

async function fetchImages(id, page) {
    console.log('[romantic] fetchImages called with id:', id, 'page:', page);
    // Reader page: /books/{id}/{page}
    var url = BASE + '/books/' + id + '/' + page;
    console.log('[romantic] fetching images from:', url);
    var html = await httpGet(url);
    console.log('[romantic] images HTML received, length:', html.length);
    var doc = runtime.html.parse(html);
    var imgs = [];
    // Prefer server-rendered imageUrl entries if present; fallback to <img id="image_*">
    var metaImages = [];
    var nextDataImgs = doc.querySelectorAll('div[class*="flex justify-center"] img');
    console.log('[romantic] found', nextDataImgs.length, 'img tags in flex justify-center divs');
    for (var i = 0; i < nextDataImgs.length; i++) {
        var img = nextDataImgs[i];
        var src = img.getAttribute('src') || img.getAttribute('data-src');
        if (!src || src.indexOf('loading.jpg') >= 0) continue;
        if (src.indexOf('http') !== 0) src = BASE + src;
        metaImages.push(src);
    }
    // If SSR didn't inline, attempt script blob containing imageUrl entries
    if (metaImages.length === 0) {
        var scripts = doc.querySelectorAll('script');
        for (var j = 0; j < scripts.length; j++) {
            var s = scripts[j];
            var t = s.textContent || '';
            var matches = t.match(/imageUrl\"\:\"(https?:\/\/[^\"]+)\"/g) || [];
            for (var k = 0; k < matches.length; k++) {
                var m = matches[k];
                var u = m.replace(/.*imageUrl\"\:\"/, '').replace(/\".*/, '');
                metaImages.push(u);
            }
        }
    }
    for (var l = 0; l < metaImages.length; l++) {
        imgs.push({ url: metaImages[l] });
    }
    console.log('[romantic] images', id, 'page', page, 'count', imgs.length);
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
  features: {}
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
    var result = {
        total: list.length,
        limit: list.length || 20,
        page: page,
        pages: 1,
        docs: list.map(toComicSimple)
    };
    console.log('[romantic] getComics returning:', result.docs.length, 'comics');
    return result;
}

async function getComicDetail(params) {
  var comicId = params.comicId;
  var detail = await fetchDetail(comicId);
  return toComicDetail(detail);
}

async function getEps(params) {
  var comicId = params.comicId;
  return {
    total: 1,
    limit: 100,
    page: 1,
    pages: 1,
    docs: [{ id: comicId, title: "全一话", order: 1, updated_at: "" }]
  };
}

async function getPictures(params) {
  var comicId = params.comicId;
  var pages = await fetchImages(comicId, 0);
  return {
    total: pages.length,
    limit: pages.length,
    page: 1,
    pages: 1,
    docs: pages.map(function (p, idx) {
      return { id: comicId + "_" + idx, media: toRemoteImageInfo(p.url || p) };
    })
  };
}

async function search(params) {
  var page = params.page || 1;
  var keyword = params.keyword || "";
  var list = await listSearch(keyword, page);
  return {
    total: list.length,
    limit: list.length || 20,
    page: page,
    pages: 1,
    docs: list.map(toComicSimple)
  };
}

const module = {
  moduleInfo,
  getCategories,
  getSortOptions,
  getComics,
  getComicDetail,
  getEps,
  getPictures,
  search
};

if (typeof exports !== 'undefined') {
  Object.assign(exports, module);
}
