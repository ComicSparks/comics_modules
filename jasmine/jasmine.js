/**
 * Jasmine 模块 - 禁漫天堂
 * 
 * @module jasmine
 * @version 1.0.0
 * @author comics
 * @description 禁漫天堂 (18comic) 数据源模块
 */

// 模块元信息
const moduleInfo = {
    id: 'jasmine',
    name: '禁漫天堂',
    version: '1.0.0',
    author: 'comics',
    description: '禁漫天堂 (JMComic/18comic) 数据源，需要登录账号',
    icon: null
};

// API 常量
const DEFAULT_API_HOST = 'www.cdnplaystation6.vip';
const DEFAULT_CDN_HOST = 'cdn-msp3.jmdanjonproxy.vip';
const APP_VERSION = '1.6.8';
const TOKEN_SECRET = '18comicAPPContent';
const DATA_SECRET = '185Hcomic3PAPP7R';

// 排序选项
const SORT_OPTIONS = [
    { value: '', name: '默认' },
    { value: 'mr', name: '最新' },
    { value: 'mv', name: '最多观看' },
    { value: 'mp', name: '最多图片' },
    { value: 'tf', name: '最多收藏' },
    { value: 'mv_t', name: '日榜' },
    { value: 'mv_w', name: '周榜' },
    { value: 'mv_m', name: '月榜' }
];

/**
 * 获取 API Host
 */
async function getApiHost() {
    const host = await runtime.storage.get('jasmine_api_host');
    return host || DEFAULT_API_HOST;
}

/**
 * 获取 CDN Host
 */
async function getCdnHost() {
    const host = await runtime.storage.get('jasmine_cdn_host');
    return host || DEFAULT_CDN_HOST;
}

/**
 * 生成时间戳
 */
function getTimestamp() {
    return Math.floor(Date.now() / 1000).toString();
}

/**
 * 生成 Token
 */
function generateToken(timestamp) {
    return runtime.crypto.md5(timestamp + TOKEN_SECRET);
}

/**
 * 解密响应数据（参考原版 decrypt_jm 逻辑）
 * key = hex(md5(timestamp + "185Hcomic3PAPP7R"))
 */
function decryptData(data, timestamp) {
    // 生成 32 字节密钥：MD5 的十六进制结果
    const key = runtime.crypto.md5(timestamp + DATA_SECRET);
    console.log('[jasmine] decrypt key: ' + key + ' (len: ' + key.length + ')');

    // AES-256-ECB 解密
    const decrypted = runtime.crypto.aesEcbDecrypt(data, key);
    console.log('[jasmine] decrypted length: ' + decrypted.length);

    return decrypted;
}

/**
 * 生成随机设备标识（参考原版 user_agent 逻辑）
 */
function generateRandomDeviceId() {
    const charset = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 9; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
}

/**
 * 获取请求头（参考原版 request_data 逻辑）
 * UA 每次都动态生成
 */
function getHeaders(timestamp) {
    const token = generateToken(timestamp);
    const deviceId = generateRandomDeviceId();

    return {
        'token': token,
        'tokenparam': `${timestamp},${APP_VERSION}`,
        'user-agent': `Mozilla/5.0 (Linux; Android 13; ${deviceId} Build/TQ1A.230305.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.196 Safari/537.36`,
        'accept-encoding': 'gzip',
        'Content-Type': 'application/x-www-form-urlencoded'
    };
}

/**
 * 初始化 cookie（参考原版 check_first 逻辑）
 * 如果没有保存的 cookie，请求 setting 接口获取初始 cookie
 */
async function initCookie() {
    const cookie = await runtime.storage.get('jasmine_cookie');
    if (cookie) {
        return; // 已有 cookie，不需要初始化
    }

    // 请求 setting 接口获取初始 cookie
    const apiHost = await getApiHost();
    const timestamp = getTimestamp();
    const headers = getHeaders(timestamp);
    headers['Host'] = apiHost;

    const url = `https://${apiHost}/setting`;
    const response = await runtime.http.get(url, headers);

    // 保存返回的 cookie
    if (response.headers && response.headers['set-cookie']) {
        await runtime.storage.set('jasmine_cookie', response.headers['set-cookie']);
    }
}

/**
 * API 请求（参考原版 request_data 逻辑）
 */
async function apiRequest(path, method = 'GET', params = null) {
    // 确保 cookie 已初始化
    await initCookie();

    const apiHost = await getApiHost();
    const timestamp = getTimestamp();
    const headers = getHeaders(timestamp);
    headers['Host'] = apiHost;

    // 添加 cookie
    const cookie = await runtime.storage.get('jasmine_cookie');
    if (cookie) {
        headers['cookie'] = cookie;
    }

    let url = `https://${apiHost}/${path}`;

    let response;
    if (method === 'GET') {
        if (params) {
            // 构建查询字符串，确保数字类型正确编码
            const queryString = Object.entries(params)
                .map(([k, v]) => {
                    // 如果值是数字，直接转换为字符串；如果是 null/undefined，跳过
                    if (v === null || v === undefined) {
                        return null;
                    }
                    const value = typeof v === 'number' ? v.toString() : String(v);
                    return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`;
                })
                .filter(item => item !== null)
                .join('&');
            if (queryString) {
                url += (url.includes('?') ? '&' : '?') + queryString;
            }
        }
        response = await runtime.http.get(url, headers);
    } else {
        // POST 请求，参数作为 form-urlencoded body
        const body = params ? Object.entries(params)
            .map(([k, v]) => {
                if (v === null || v === undefined) {
                    return null;
                }
                const value = typeof v === 'number' ? v.toString() : String(v);
                return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`;
            })
            .filter(item => item !== null)
            .join('&') : '';
        response = await runtime.http.post(url, body, headers);
    }

    if (response.status !== 200) {
        throw new Error(`API error: ${response.status}`);
    }

    // 解析响应
    let rsp = JSON.parse(response.body);
    let data = rsp.data;

    console.log('[jasmine] data type: ' + typeof data);

    if ((typeof data) + '' === 'string' || data instanceof String) {
        console.log('[jasmine] data is string, decrypting...');
        data = decryptData(data, timestamp);
    }

    return data;
}

/**
 * 转换远程图片信息
 */
function toRemoteImageInfo(url) {
    if (!url) {
        return {
            original_name: '',
            path: '',
            file_server: '',
            headers: {}
        };
    }
    return {
        original_name: '',
        path: url,
        file_server: '',
        headers: {}
    };
}

/**
 * 获取封面 URL
 */
function getCoverUrl(comicId, cdnHost) {
    return `https://${cdnHost}/media/albums/${comicId}_3x4.jpg`;
}

/**
 * 获取页面图片 URL
 */
function getPageImageUrl(chapterId, imageName, cdnHost) {
    return `https://${cdnHost}/media/photos/${chapterId}/${imageName}?v=`;
}

/**
 * 转换漫画简略信息
 */
function toComicSimple(comic, cdnHost) {
    // 确保 ID 是字符串类型（使用模板字符串，QuickJS 兼容性更好）
    let id = '';
    if (comic.id != null && comic.id !== undefined) {
        // 强制转换为字符串，即使原始值是数字
        id = String(comic.id);
    } else if (comic.aid != null && comic.aid !== undefined) {
        id = String(comic.aid);
    }

    // 如果 ID 仍然是空字符串，使用默认值
    if (!id) {
        id = '0';
    }

    const coverUrl = getCoverUrl(id, cdnHost);

    // 确保所有数字字段都是数字类型
    let likesCount = 0;
    if (typeof comic.likes === 'number') {
        likesCount = comic.likes;
    } else if (comic.likes != null) {
        likesCount = parseInt(comic.likes, 10) || 0;
    }

    const result = {
        id: String(id),  // 强制确保是字符串类型
        title: String(comic.name || comic.title || ''),
        author: String(comic.author || ''),
        pages_count: 0,
        eps_count: 0,
        finished: false,
        categories: [],
        thumb: toRemoteImageInfo(coverUrl),
        likes_count: Number(likesCount)  // 确保是数字
    };

    return result;
}

/**
 * 转换漫画详情
 */
function toComicDetail(album, cdnHost) {
    // 确保 ID 是字符串类型（使用模板字符串）
    const id = album.id != null ? `${album.id}` : '';
    const coverUrl = getCoverUrl(id, cdnHost);
    const authors = Array.isArray(album.author) ? album.author.join(', ') : `${album.author || ''}`;

    // 确保所有数字字段都是数字类型
    const epsCount = typeof album.series === 'object' && album.series != null && Array.isArray(album.series) ? album.series.length : 1;
    const likesCount = typeof album.likes === 'number' ? album.likes : (parseInt(album.likes, 10) || 0);
    const viewsCount = typeof album.total_views === 'number' ? album.total_views : (parseInt(album.total_views, 10) || 0);
    const commentsCount = typeof album.comment_total === 'number' ? album.comment_total : (parseInt(album.comment_total, 10) || 0);

    return {
        id: id,  // 确保是字符串
        title: `${album.name || ''}`,
        author: authors,
        pages_count: 0,
        eps_count: epsCount,  // 确保是数字
        finished: false,
        categories: [],
        thumb: toRemoteImageInfo(coverUrl),
        likes_count: likesCount,  // 确保是数字
        description: `${album.description || ''}`,
        chinese_team: '',
        tags: Array.isArray(album.tags) ? album.tags.map(t => `${t}`) : [],
        updated_at: '',
        created_at: '',
        allow_download: true,
        views_count: viewsCount,  // 确保是数字
        is_favourite: Boolean(album.is_favorite),
        is_liked: Boolean(album.liked),
        comments_count: commentsCount  // 确保是数字
    };
}

/**
 * 转换章节（系列）
 */
function toEp(series, index) {
    // 确保 ID 是字符串类型（使用模板字符串）
    const id = series.id != null ? `${series.id}` : `${index}`;

    return {
        id: id,  // 确保是字符串
        title: `${series.name || '第' + (index + 1) + '话'}`,
        order: index + 1,  // 确保是数字
        updated_at: ''
    };
}

/**
 * 转换图片
 */
function toPicture(imageName, chapterId, index, cdnHost) {
    const url = getPageImageUrl(chapterId, imageName, cdnHost);
    return {
        id: `${chapterId}_${index}`,
        media: toRemoteImageInfo(url),
        // 添加元数据，用于图片处理
        metadata: {
            chapterId: String(chapterId),
            imageName: String(imageName)
        }
    };
}

// ============ 模块接口实现 ============

/**
 * 获取分类列表
 */
async function getCategories() {
    try {
        const raw = await apiRequest('categories', 'GET');
        console.log('[jasmine] categories API response type:', typeof raw);

        // 兼容字符串返回
        let data = raw;
        if (typeof raw === 'string') {
            try {
                data = JSON.parse(raw);
            } catch (e) {
                console.warn('[jasmine] categories: JSON.parse failed, using raw string');
            }
        }

        // 抽取 categories 列表，支持多种结构
        let categories = [];
        if (Array.isArray(data)) {
            categories = data;
        } else if (data && Array.isArray(data.categories)) {
            categories = data.categories;
        } else if (data && data.data && Array.isArray(data.data.categories)) {
            categories = data.data.categories;
        } else if (data && Array.isArray(data.list)) {
            categories = data.list;
        }

        console.log('[jasmine] categories parsed length:', categories.length);

        const result = [];
        // 添加"全部"分类（slug 为空字符串）
        result.push({
            id: '',
            slug: '',
            title: '全部',
            description: '',
            thumb: null,
            is_web: false,
            active: true,
            link: null
        });

        for (const cat of categories) {
            // 统一字段，确保类型正确
            const id = cat.id != null ? String(cat.id) : (cat.slug || '');
            const slug = cat.slug != null ? String(cat.slug) : '';
            const title = String(cat.name || cat.title || '');
            const desc = String(cat.description || '');

            result.push({
                id: id,
                slug: slug,
                title: title,
                description: desc,
                thumb: null,
                is_web: false,
                active: true,
                link: null
            });
        }

        return result;
    } catch (e) {
        console.log('[jasmine] getCategories error:', e.message);
        // API 错误时返回默认分类
        return [{
            id: '',
            slug: '',
            title: '全部',
            description: '',
            thumb: null,
            is_web: false,
            active: true,
            link: null
        }];
    }
}

/**
 * 获取排序选项
 */
function getSortOptions() {
    return SORT_OPTIONS;
}

/**
 * 获取漫画列表
 * 参考原版实现：
 * - ComicsQuery: { categories_slug: String, sort_by: SortBy, page: i64 }
 * - Rust 客户端：comics(categories_slug, sort_by, page) -> SearchPage<ComicSimple>
 * - 使用 "categories/filter" 端点
 * - SearchPage 结构：{ search_query: String, total: i64, content: Vec<ComicSimple>, redirect_aid: Option<i64> }
 * - ComicSimple 结构：{ id: i64, name: String, author: String, image: String, category: CategorySimple, category_sub: CategorySimple }
 */
async function getComics(params) {
    // 参考 ComicsQuery 结构：categories_slug, sort_by, page
    // 默认分类应该是空字符串
    const categoriesSlug = params?.categories_slug || params?.categorySlug || params?.category_slug || '';
    // 排序默认值应该是 "mr"（最新）
    const sortBy = params?.sort_by || params?.sortBy || 'mr';
    // page 可能是数字或字符串，统一转换为数字
    const page = typeof params?.page === 'number' ? params.page : (parseInt(params?.page, 10) || 1);

    try {
        // 参考原版 jasmine，使用 categories/filter 端点
        // 参数：page (数字), order (空字符串), c (分类slug), o (排序方式)
        const requestParams = {
            page: page,  // 原版使用数字，不是字符串
            order: '',   // 原版固定为空字符串
            o: sortBy  // 排序方式，默认为 "mr"（最新）
        };

        // 如果分类 slug 不为空，添加到请求参数
        if (categoriesSlug) {
            requestParams.c = categoriesSlug;
        }

        console.log('[jasmine] getComics request params:', JSON.stringify(requestParams));

        // 使用 categories/filter 端点，返回 SearchPage<ComicSimple>
        const searchPageData = await apiRequest('categories/filter', 'GET', requestParams);
        console.log('[jasmine] getComics API response type:', typeof searchPageData);
        
        // 如果返回的是字符串，需要解析为 JSON 对象
        let searchPage;
        if (typeof searchPageData === 'string') {
            searchPage = JSON.parse(searchPageData);
        } else {
            searchPage = searchPageData;
        }
        
        console.log('[jasmine] getComics API response keys:', searchPage ? Object.keys(searchPage) : 'null');
        console.log('[jasmine] searchPage.content type:', typeof searchPage?.content, 'isArray:', Array.isArray(searchPage?.content));

        // 原版返回的是 SearchPage 结构：{ search_query, total, content, redirect_aid }
        // content 是 ComicSimple 数组
        const content = Array.isArray(searchPage?.content) ? searchPage.content : [];
        const total = typeof searchPage?.total === 'number' ? searchPage.total : (parseInt(searchPage?.total, 10) || 0);

        console.log('[jasmine] getComics parsed content length:', content.length, 'total:', total);

        const cdnHost = await getCdnHost();
        const docs = content.map((comic) => {
            // comic 是 ComicSimple 结构：{ id: i64, name, author, image, category, category_sub }
            return toComicSimple(comic, cdnHost);
        });

        // 返回标准格式
        const result = {
            total: Number(total),
            limit: 20,
            page: Number(page),
            pages: Number(Math.ceil(total / 20)),
            docs: docs
        };

        console.log('[jasmine] getComics returning', result.docs.length, 'comics');

        return result;
    } catch (e) {
        console.error('[jasmine] getComics error:', e.message);
        // 返回空结果而不是抛出错误，让 UI 显示"暂无漫画"
        return {
            total: 0,
            limit: 20,
            page: Number(page),
            pages: 0,
            docs: []
        };
    }
}

/**
 * 获取漫画详情
 */
async function getComicDetail(params) {
    const comicId = params?.comicId || params?.comic_id || '';

    const data = await apiRequest('album', 'GET', { id: comicId });
    
    // 如果返回的是字符串，需要解析为 JSON 对象
    let album;
    if (typeof data === 'string') {
        album = JSON.parse(data);
    } else {
        album = data;
    }
    
    const cdnHost = await getCdnHost();
    return toComicDetail(album, cdnHost);
}

/**
 * 获取章节列表
 */
async function getEps(params) {
    const comicId = params?.comicId || params?.comic_id || '';
    const page = typeof params?.page === 'number' ? params.page : (parseInt(params?.page, 10) || 1);

    // 获取漫画详情来获取系列列表
    const data = await apiRequest('album', 'GET', { id: comicId });
    
    // 如果返回的是字符串，需要解析为 JSON 对象
    let album;
    if (typeof data === 'string') {
        album = JSON.parse(data);
    } else {
        album = data;
    }
    
    const series = album.series || [];

    // 如果没有系列，创建一个默认章节
    if (series.length === 0) {
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

    return {
        total: Number(series.length),  // 确保是数字
        limit: 100,
        page: 1,
        pages: 1,
        docs: series.map((s, idx) => toEp(s, idx))
    };
}

/**
 * 获取章节图片
 */
async function getPictures(params) {
    const comicId = params?.comicId || params?.comic_id || '';
    const epId = params?.epId || params?.ep_id || '';
    const page = typeof params?.page === 'number' ? params.page : (parseInt(params?.page, 10) || 1);

    // epId 是章节 ID（系列 ID）
    const chapterId = epId || comicId;

    const data = await apiRequest('chapter', 'GET', { id: chapterId });
    
    // 如果返回的是字符串，需要解析为 JSON 对象
    let chapter;
    if (typeof data === 'string') {
        chapter = JSON.parse(data);
    } else {
        chapter = data;
    }
    
    const images = chapter.images || [];

    const cdnHost = await getCdnHost();
    const docs = images.map((img, i) => toPicture(img, chapterId, i, cdnHost));

    return {
        total: Number(images.length),  // 确保是数字
        limit: Number(images.length),  // 确保是数字
        page: 1,
        pages: 1,
        docs: docs
    };
}

/**
 * 搜索漫画
 */
async function search(params) {
    const keyword = params?.keyword || '';
    const sortBy = params?.sortBy || params?.sort_by || 'mr';
    const page = typeof params?.page === 'number' ? params.page : (parseInt(params?.page, 10) || 1);

    const requestParams = {
        search_query: keyword,
        page: page.toString(),
        o: sortBy
    };

    const data = await apiRequest('search', 'GET', requestParams);
    
    // 如果返回的是字符串，需要解析为 JSON 对象
    let searchResult;
    if (typeof data === 'string') {
        searchResult = JSON.parse(data);
    } else {
        searchResult = data;
    }
    
    const content = searchResult.content || [];
    const total = searchResult.total || content.length;

    const cdnHost = await getCdnHost();
    const docs = content.map(comic => toComicSimple(comic, cdnHost));

    // 确保返回的对象结构完全符合 Rust 期望的类型
    const result = {
        total: Number(total),  // 确保是数字
        limit: 20,
        page: Number(page),  // 确保是数字
        pages: Number(Math.ceil(total / 20)),  // 确保是数字
        docs: docs.map(doc => {
            // 确保每个文档的所有字段类型正确
            return {
                id: String(doc.id),  // 强制转换为字符串
                title: String(doc.title),
                author: String(doc.author),
                pages_count: Number(doc.pages_count || 0),
                eps_count: Number(doc.eps_count || 0),
                finished: Boolean(doc.finished),
                categories: Array.isArray(doc.categories) ? doc.categories.map(c => String(c)) : [],
                thumb: doc.thumb,
                likes_count: Number(doc.likes_count || 0)
            };
        })
    };

    return result;
}

// ============ 登录相关 ============

/**
 * 预登录（参考原版 pre_login 逻辑）
 * 如果有保存的账号密码，自动登录
 */
async function preLogin() {
    // 确保 cookie 已初始化
    await initCookie();

    const username = await runtime.storage.get('username');
    const password = await runtime.storage.get('password');

    if (username && password) {
        try {
            await login(username, password);
            return { preSet: true, preLogin: true };
        } catch (e) {
            return { preSet: true, preLogin: false, message: e.message };
        }
    }

    return { preSet: false, preLogin: false };
}

/**
 * 登录（参考原版 login 逻辑）
 */
async function login(username, password) {
    const data = await apiRequest('login', 'POST', {
        username: username,
        password: password
    });

    // 保存 cookie（参考原版保存逻辑）
    if (data.cookie) {
        await runtime.storage.set('jasmine_cookie', data.cookie);
    }

    // 保存用户名密码以便自动重新登录
    await runtime.storage.set('username', username);
    await runtime.storage.set('password', password);
    await runtime.storage.set('last_login_username', username);

    return { success: true };
}

/**
 * 检查登录状态
 */
async function isLoggedIn() {
    const cookie = await runtime.storage.get('jasmine_cookie');
    return !!cookie;
}

/**
 * 登出（参考原版 logout 逻辑）
 */
async function logout() {
    await runtime.storage.remove('jasmine_cookie');
    await runtime.storage.remove('username');
    await runtime.storage.remove('password');
    await runtime.storage.remove('last_login_username');
    return { success: true };
}

/**
 * 设置 API Host
 */
async function setApiHost(host) {
    await runtime.storage.set('jasmine_api_host', host);
}

/**
 * 设置 CDN Host
 */
async function setCdnHost(host) {
    await runtime.storage.set('jasmine_cdn_host', host);
}

/**
 * 处理图片（解码）
 * 参数：
 * - imageData: base64 编码的图片数据
 * - params: 包含 chapterId 和 imageName 的对象
 * 返回：处理后的图片数据（base64 编码）
 * 
 * 参考原版 check_page_image_flag 逻辑
 */
async function processImage(args) {
    const { imageData, params } = args;
    const { chapterId, imageName } = params || {};

    console.log('[jasmine] processImage called, chapterId:', chapterId, 'imageName:', imageName);
    console.log('[jasmine] params:', JSON.stringify(params));

    // 如果没有提供必要的参数，返回原始数据
    if (!chapterId || !imageName) {
        console.log('[jasmine] processImage: missing params, returning original image');
        return { imageData: imageData };
    }

    try {
        // 将 chapterId 转换为数字
        const pageImageFlag = parseInt(chapterId, 10) || 0;
        console.log('[jasmine] processImage: pageImageFlag =', pageImageFlag);

        // 如果 pageImageFlag <= 220980，直接返回原始数据
        if (pageImageFlag <= 220980) {
            console.log('[jasmine] processImage: pageImageFlag <= 220980, returning original image');
            return { imageData: imageData };
        }

        // 获取图片信息（宽高、格式）
        console.log('[jasmine] processImage: getting image info...');
        const infoJson = runtime.image.getInfo(imageData);
        const info = JSON.parse(infoJson);
        console.log('[jasmine] processImage: image info - width:', info.width, 'height:', info.height, 'format:', info.format);

        // 如果是 GIF，直接返回原始数据
        if (info.format === 'gif') {
            console.log('[jasmine] processImage: GIF format, returning original image');
            return { imageData: imageData };
        }

        // 计算行数
        let rows;
        if (pageImageFlag < 268850) {
            rows = 10;
            console.log('[jasmine] processImage: pageImageFlag < 268850, using rows = 10');
        } else {
            // 根据 MD5 计算行数
            // Rust 代码：page_image_flag2.split(".").nth(0).unwrap()
            // split(".").nth(0) 取第一个点之前的部分（如果没有点，返回整个字符串）
            // 在 JS 中，split('.')[0] 也是取第一个点之前的部分
            const imageNameWithoutExt = imageName.split('.')[0];
            const md5Input = String(pageImageFlag) + imageNameWithoutExt;
            const md5Hash = runtime.crypto.md5(md5Input);
            
            // Rust 代码逻辑：
            // let hex = hex::encode(md5.as_ref());  // 将 MD5 字节数组编码为十六进制字符串
            // let bytes = hex.as_bytes();           // 将字符串转换为 UTF-8 字节数组
            // let byte = bytes[bytes.len() - 1];    // 取最后一个字节（最后一个字符的 ASCII 码）
            // 
            // 例如：hex = "eca12013d6c8913407cd3c87650ac901"
            // bytes 是字符串的 UTF-8 字节，最后一个字节是 '1' 的 ASCII 码 = 49
            // (49 as i64) % 10 = 9, 然后 9 * 2 + 2 = 20
            //
            // 但是，如果我们直接取最后一个十六进制字符 '1'，转换为数值是 1
            // 1 % 10 = 1, 1 * 2 + 2 = 4
            //
            // 这说明 Rust 代码使用的是 ASCII 码值，而不是十六进制字符的数值
            // 所以我们需要取最后一个字符的 ASCII 码值
            const lastChar = md5Hash[md5Hash.length - 1];
            const lastCharCode = lastChar.charCodeAt(0);  // 获取字符的 ASCII 码
            
            // 使用 ASCII 码值进行计算（与 Rust 代码一致）
            let byteValue;
            if (pageImageFlag <= 421925) {
                byteValue = (lastCharCode % 10);
            } else {
                byteValue = (lastCharCode % 8);
            }
            rows = (byteValue * 2 + 2);
            
            console.log('[jasmine] processImage: calculated rows =', rows, 'from md5 input:', md5Input, 'md5:', md5Hash, 'lastChar:', lastChar, 'charCode:', lastCharCode, 'byteValue:', byteValue);
        }

        // 使用 Rust API 重新排列图片行
        console.log('[jasmine] processImage: rearranging image rows...');
        const processedImageData = runtime.image.rearrangeRows(imageData, rows);
        console.log('[jasmine] processImage: image rearranged successfully, processed data length:', processedImageData.length);

        return { imageData: processedImageData };
    } catch (e) {
        console.error('[jasmine] processImage error:', e.message);
        console.error('[jasmine] processImage error stack:', e.stack);
        // 处理失败，返回原始数据
        return { imageData: imageData };
    }
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
    // 额外方法
    login,
    isLoggedIn,
    logout,
    setApiHost,
    setCdnHost,
    // 图片处理
    processImage
};

// 兼容导出
if (typeof exports !== 'undefined') {
    Object.assign(exports, module);
}
