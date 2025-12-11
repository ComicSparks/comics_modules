/**
 * Wax 模块 - 绅士漫画
 * 
 * @module wax
 * @version 1.0.0
 * @author comics
 * @description 绅士漫画 (wnacg.com) 数据源模块
 */

// 模块元信息
var moduleInfo = {
    id: 'wax',
    name: '绅士漫画',
    version: '1.0.0',
    author: 'comics',
    description: '绅士漫画 (wnacg) 数据源，需要登录会员',
    icon: null,
    features: {
        authForm: true
    }
};

// 默认主机与分流列表
var DEFAULT_HOST = 'https://www.wn03.ru';
var WAX_HOSTS = [
    'https://www.wn04.ru',
    'https://www.wnacg05.cc',
    'https://www.wnacg03.cc',
    'https://www.wn03.ru',
    'https://www.wnacg02.cc',
    'https://www.wnacg01.cc',
    'https://wnacg.com',
    'https://wnacg.ru',
];

// 分类映射
var CATEGORIES = [
    { id: '', title: '全部漫画' },
    { id: '5', title: '同人誌' },
    { id: '1', title: '同人誌 - 漢化' },
    { id: '12', title: '同人誌 - 日語' },
    { id: '16', title: '同人誌 - English' },
    { id: '2', title: '同人誌 - CG畫集' },
    { id: '22', title: '同人誌 - 3D漫畫' },
    { id: '3', title: '同人誌 - Cosplay' },
    { id: '37', title: '同人誌 - AI圖集' },
    { id: '6', title: '單行本' },
    { id: '9', title: '單行本 - 漢化' },
    { id: '13', title: '單行本 - 日語' },
    { id: '17', title: '單行本 - English' },
    { id: '7', title: '雜誌&短篇' },
    { id: '10', title: '雜誌&短篇 - 漢化' },
    { id: '14', title: '雜誌&短篇 - 日語' },
    { id: '19', title: '韓漫' },
    { id: '20', title: '韓漫 - 漢化' },
    { id: '21', title: '韓漫 - 生肉' }
];

// 排序选项
var SORT_OPTIONS = [
    { value: '', name: '默认' }
];

/**
 * 获取主机地址
 */
async function getHost() {
    var host = await runtime.storage.get('wax_host');
    return host || DEFAULT_HOST;
}

/**
 * 设置主机地址
 */
async function setHost(host) {
    await runtime.storage.set('wax_host', host);
}

/**
 * 获取请求头
 */
async function getHeaders() {
    var headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ1A.230305.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    };
    
    var cookie = await runtime.storage.get('wax_cookie');
    if (cookie) {
        headers['Cookie'] = cookie;
    }
    
    return headers;
}

/**
 * HTTP GET 请求
 */
async function httpGet(url) {
    var headers = await getHeaders();
    var response = await runtime.http.get(url, headers);
    
    if (response.status !== 200) {
        throw new Error('HTTP error: ' + response.status);
    }
    
    return response.body;
}

/**
 * 修复 URL
 */
function fixUrl(url) {
    if (!url) return '';
    // 先清理开头的多余斜杠，保留最多2个
    url = url.replace(/^\/\/+/, '//');
    // 处理 // 开头的协议相对URL
    if (url.startsWith('//')) return 'https:' + url;
    // 处理多余斜杠 (如 https:////)
    url = url.replace(/^(https?:)\/\/+/, '$1//');
    return url;
}

/**
 * 解析漫画列表（使用 runtime.html）
 */
function parseComicList(html) {
    var comics = [];
    var seen = {};
    
    // 使用 runtime.html.select 获取所有漫画链接
    var itemsJson = runtime.html.select(html, 'a[href*="aid-"]');
    var items = JSON.parse(itemsJson);
    
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var href = item.attrs.href || '';
        var match = href.match(/aid-(\d+)/);
        if (!match) continue;
        
        var id = match[1];
        if (seen[id]) continue;
        seen[id] = true;
        
        // 从 item.html 中提取图片和标题
        var cover = runtime.html.attr(item.html, 'img', 'src') || 
                    runtime.html.attr(item.html, 'img', 'data-original') || '';
        
        var title = runtime.html.attr(item.html, 'img', 'title') ||
                    runtime.html.attr(item.html, 'img', 'alt') ||
                    runtime.html.text(item.html, 'span') ||
                    '漫画 ' + id;
        
        comics.push({
            id: id,
            cover: fixUrl(cover),
            title: title.trim()
        });
    }
    
    console.log('[wax] parseComicList found ' + comics.length + ' comics');
    return comics;
}

/**
 * 解析分页
 */
function parsePagination(html) {
    var pageRegex = /page-(\d+)\.html/gi;
    var maxPage = 1;
    var match;
    while ((match = pageRegex.exec(html)) !== null) {
        var page = parseInt(match[1]);
        if (page > maxPage) maxPage = page;
    }
    return { currentPage: 1, maxPage: maxPage };
}

/**
 * 解析漫画详情（使用 runtime.html）
 */
function parseComicDetail(html, comicId) {
    console.log('[wax] parseComicDetail called');
    var detail = {
        id: comicId,
        title: '',
        author: '',
        description: '',
        tags: [],
        labels: [],
        cover: ''
    };
    
    // 标题 - 从 #comicName 或 .BarTit 获取
    detail.title = runtime.html.text(html, '#comicName') ||
                   runtime.html.text(html, '.BarTit') ||
                   runtime.html.text(html, 'title') || '';
    // 清理标题
    detail.title = detail.title.trim().replace(/-紳士漫畫.*$/, '').replace(/-绅士漫画.*$/, '');
    
    // 封面 - 从 .pic img 或 #Cover img 获取
    detail.cover = runtime.html.attr(html, '.pic img', 'src') ||
                   runtime.html.attr(html, '#Cover img', 'src') ||
                   runtime.html.attr(html, '.Introduct_Sub img', 'src') || '';
    detail.cover = fixUrl(detail.cover);
    
    // 作者 - 从 .introName 获取
    detail.author = runtime.html.text(html, '.introName') ||
                    runtime.html.text(html, 'a.pd.introName') || '';
    
    // 分类 - 从 .sub_r .pd 获取
    var categoryText = runtime.html.text(html, '.sub_r p:nth-child(2) a.pd') || '';
    if (categoryText) {
        detail.labels.push(categoryText.trim());
    }
    
    // 标签 - 从 .tagshow 获取
    var tagsJson = runtime.html.texts(html, 'a.tagshow');
    var tagTexts = JSON.parse(tagsJson);
    for (var i = 0; i < tagTexts.length; i++) {
        var t = tagTexts[i].trim();
        if (t) detail.tags.push(t);
    }
    
    // 描述 - 从 .txtDesc 获取
    detail.description = runtime.html.text(html, '.txtDesc') || '';
    // 清理描述中的广告文字
    detail.description = detail.description.replace(/為了紳士漫畫更好.*$/, '').trim();
    
    console.log('[wax] title: ' + detail.title + ', cover: ' + detail.cover + ', author: ' + detail.author);
    return detail;
}

/**
 * 解析漫画图片（从 gallery JS 内容）
 * gallery页面返回的是JS脚本，包含 imglist 数组
 */
function parseComicPages(jsContent) {
    console.log('[wax] parseComicPages called, content length: ' + jsContent.length);
    var pages = [];
    
    // 图片列表在 JS 中的格式 (注意引号被转义):
    // { url: fast_img_host+\"//img5.qy0.ru/data/2676/14/01.jpg\", caption: \"[01]\"}
    
    // 方法1: 正则匹配所有 url 字段 (处理转义引号 \")
    var urlRegex = /url:\s*(?:fast_img_host\s*\+\s*)?\\?["']([^"'\\]+)\\?["']/g;
    var match;
    while ((match = urlRegex.exec(jsContent)) !== null) {
        var url = match[1];
        // 过滤掉非漫画图片
        if (url.indexOf('/themes/') >= 0 || url.indexOf('/bg/') >= 0) {
            continue;
        }
        pages.push({
            url: fixUrl(url),
            caption: '第' + (pages.length + 1) + '页'
        });
    }
    
    console.log('[wax] parseComicPages found ' + pages.length + ' pages');
    return pages;
}

/**
 * 解析详情页中的图片（备用方案）
 */
function parseComicPagesFromHtml(html) {
    console.log('[wax] parseComicPagesFromHtml called');
    var pages = [];
    var urls = [];
    
    // 方式1: pic_img 类
    var attrsJson = runtime.html.attrs(html, 'img.pic_img', 'src');
    urls = JSON.parse(attrsJson);
    console.log('[wax] pic_img: ' + urls.length);
    
    // 方式2: data-original
    if (urls.length === 0) {
        attrsJson = runtime.html.attrs(html, 'img[data-original]', 'data-original');
        urls = JSON.parse(attrsJson);
        // 过滤
        urls = urls.filter(function(u) {
            return u.indexOf('/photos/') >= 0 || u.indexOf('/pic/') >= 0 || u.indexOf('/manga/') >= 0 || u.indexOf('/data/') >= 0;
        });
        console.log('[wax] data-original: ' + urls.length);
    }
    
    // 方式3: album_photo
    if (urls.length === 0) {
        attrsJson = runtime.html.attrs(html, 'img[id^="album_photo_"]', 'src');
        urls = JSON.parse(attrsJson);
        console.log('[wax] album_photo: ' + urls.length);
    }
    
    for (var i = 0; i < urls.length; i++) {
        pages.push({
            url: fixUrl(urls[i]),
            caption: '第' + (i + 1) + '页'
        });
    }
    
    return pages;
}

/**
 * 转换远程图片信息
 */
function toRemoteImageInfo(url) {
    var fixedUrl = url || '';
    if (fixedUrl.startsWith('//')) {
        fixedUrl = 'https:' + fixedUrl;
    }
    return {
        original_name: '',
        path: fixedUrl,
        file_server: '',
        headers: {}
    };
}

/**
 * 转换漫画简略信息
 */
function toComicSimple(comic) {
    return {
        id: comic.id,
        title: comic.title,
        author: '',
        pages_count: 0,
        eps_count: 1,
        finished: true,
        categories: [],
        thumb: toRemoteImageInfo(comic.cover),
        likes_count: 0
    };
}

/**
 * 转换漫画详情
 */
function toComicDetail(detail) {
    return {
        id: detail.id,
        title: detail.title,
        author: detail.author || '',
        pages_count: 0,
        eps_count: 1,
        finished: true,
        categories: detail.labels || [],
        thumb: toRemoteImageInfo(detail.cover),
        likes_count: 0,
        description: detail.description || '',
        chinese_team: '',
        tags: detail.tags || [],
        updated_at: '',
        created_at: '',
        allow_download: true,
        views_count: 0,
        is_favourite: false,
        is_liked: false,
        comments_count: 0
    };
}

// ============ 模块接口 ============

async function getCategories() {
    return CATEGORIES.map(function(cat) {
        return {
            id: cat.id,
            title: cat.title,
            description: '',
            thumb: null,
            is_web: false,
            active: true,
            link: null
        };
    });
}

function getSortOptions() {
    return SORT_OPTIONS;
}

async function getComics(params) {
    var categorySlug = params.categorySlug;
    var page = params.page;
    var host = await getHost();
    
    var url;
    if (categorySlug) {
        url = host + '/albums-index-page-' + page + '-cate-' + categorySlug + '.html';
    } else {
        url = host + '/albums-index-page-' + page + '.html';
    }
    
    var html = await httpGet(url);
    var comics = parseComicList(html);
    var pagination = parsePagination(html);
    
    return {
        total: pagination.maxPage * 20,
        limit: 20,
        page: page,
        pages: pagination.maxPage,
        docs: comics.map(toComicSimple)
    };
}

async function getComicDetail(params) {
    var comicId = params.comicId;
    var host = await getHost();
    
    var url = host + '/photos-index-aid-' + comicId + '.html';
    var html = await httpGet(url);
    var detail = parseComicDetail(html, comicId);
    
    return toComicDetail(detail);
}

async function getEps(params) {
    var comicId = params.comicId;
    
    return {
        total: 1,
        limit: 100,
        page: 1,
        pages: 1,
        docs: [{
            id: comicId,
            title: '全一话',
            order: 1,
            updated_at: ''
        }]
    };
}

async function getPictures(params) {
    var comicId = params.comicId;
    var host = await getHost();
    
    // 首先尝试 gallery 页面 (JS格式)
    var galleryUrl = host + '/photos-gallery-aid-' + comicId + '.html';
    console.log('[wax] getPictures gallery url: ' + galleryUrl);
    var galleryContent = await httpGet(galleryUrl);
    var pages = parseComicPages(galleryContent);
    
    // 如果gallery没有数据，尝试从详情页解析
    if (pages.length === 0) {
        console.log('[wax] gallery empty, trying detail page');
        var detailUrl = host + '/photos-index-aid-' + comicId + '.html';
        var detailHtml = await httpGet(detailUrl);
        pages = parseComicPagesFromHtml(detailHtml);
    }
    
    console.log('[wax] getPictures total: ' + pages.length);
    
    return {
        total: pages.length,
        limit: pages.length,
        page: 1,
        pages: 1,
        docs: pages.map(function(p, idx) {
            return {
                id: comicId + '_' + idx,
                media: toRemoteImageInfo(p.url)
            };
        })
    };
}

async function search(params) {
    var keyword = params.keyword;
    var page = params.page;
    var host = await getHost();
    
    var url = host + '/search/?q=' + encodeURIComponent(keyword) + '&p=' + page;
    var html = await httpGet(url);
    var comics = parseComicList(html);
    var pagination = parsePagination(html);
    
    return {
        total: pagination.maxPage * 20,
        limit: 20,
        page: page,
        pages: pagination.maxPage,
        docs: comics.map(toComicSimple)
    };
}

async function login(username, password) {
    var host = await getHost();
    var headers = await getHeaders();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    
    var body = 'login_name=' + encodeURIComponent(username) + '&login_pass=' + encodeURIComponent(password);
    var url = host + '/users-check.html';
    
    var response = await runtime.http.post(url, body, headers);
    
    if (response.headers['set-cookie']) {
        await runtime.storage.set('wax_cookie', response.headers['set-cookie']);
    }
    
    if (response.status === 302 || response.body.indexOf('成功') >= 0) {
        return { success: true };
    }
    
    throw new Error('登录失败');
}

async function isLoggedIn() {
    var cookie = await runtime.storage.get('wax_cookie');
    return !!cookie;
}

async function logout() {
    await runtime.storage.remove('wax_cookie');
    return { success: true };
}

// 认证表单定义与提交
var authForm = {
    fields: [
        { key: 'username', type: 'text', label: '账号', placeholder: '请输入账号' },
        { key: 'password', type: 'password', label: '密码', placeholder: '请输入密码' },
        {
            key: 'wax_host',
            type: 'select',
            label: '分流(Host)',
            options: WAX_HOSTS.map(function(host) { return { label: host, value: host }; }),
            allowCustom: true,
            placeholder: '自定义主机或选择'
        }
    ]
};

async function submitAuthForm(values) {
    try {
        var username = values.username || '';
        var password = values.password || '';
        var host = values.wax_host || '';
        if (host) await setHost(host);
        // 保存账号密码供后续自动登录
        if (username) await runtime.storage.set('username', username);
        if (password) await runtime.storage.set('password', password);
        var loginAttempt = false;
        var loginSuccess = false;
        if (username && password) {
            loginAttempt = true;
            try {
                var rsp = await login(username, password);
                loginSuccess = !!(rsp && rsp.success);
            } catch (e) {
                loginSuccess = false;
            }
        }
        return { success: true, loginAttempt: loginAttempt, loginSuccess: loginSuccess };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

function getAuthForm() {
    return authForm;
}

async function getAuthValues() {
    var username = await runtime.storage.get('username');
    var password = await runtime.storage.get('password');
    var host = await runtime.storage.get('wax_host');
    return {
        username: username || '',
        password: password || '',
        wax_host: host || ''
    };
}

// 导出模块
const module = {
    moduleInfo,
    getCategories,
    getSortOptions,
    getComics,
    getComicDetail,
    getEps,
    getPictures,
    search,
    login,
    isLoggedIn,
    logout,
    setHost,
    authForm,
    submitAuthForm,
    getAuthForm,
    getAuthValues
};

if (typeof exports !== 'undefined') {
    Object.assign(exports, module);
}
