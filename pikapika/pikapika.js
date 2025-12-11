/**
 * Pikapika 模块 - 哔咔漫画
 * 
 * @module pikapika
 * @version 1.0.0
 * @author comics
 * @description 哔咔漫画 (picacomic.com) 数据源模块
 */

// 模块元信息
const moduleInfo = {
    id: 'pikapika',
    name: '哔咔漫画',
    version: '1.0.0',
    author: 'comics',
    description: '哔咔漫画 (PicACG) 数据源，需要登录账号',
    icon: null,
    features: {
        authForm: true
    }
};

// API 常量
const API_HOST = 'picaapi.picacomic.com';
// 分流IP列表（参考原版）
const SWITCH_ADDRESSES = {
    1: '172.67.7.24',
    2: '172.67.194.19',
    3: '172.67.80.1',      // 分流3
    4: '104.21.235.3',
    5: '104.21.235.4',
    7: '104.20.180.50',
    8: '104.20.181.50',
    9: '104.22.64.159',
    10: '104.21.91.145'
};
// 默认使用分流3
const DEFAULT_SWITCH = 3;
const API_KEY = 'C69BAF41DA5ABD1FFEDC6D2FEA56B';
const SECRET_KEY = '~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn';
const NONCE = 'b1ab87b4800d4d4590a11701b8551afa';

// Token 有效期 24 小时（参考原版）
const TOKEN_EXPIRE_MS = 24 * 60 * 60 * 1000;

// 排序选项
const SORT_OPTIONS = [
    { value: 'ua', name: '默认' },
    { value: 'dd', name: '最新发布' },
    { value: 'da', name: '最早发布' },
    { value: 'ld', name: '最多喜欢' },
    { value: 'vd', name: '最多浏览' }
];

// 内置分类
const BUILT_IN_CATEGORIES = [
    { id: 'leaderboard:H24', title: '过去24小时', isWeb: false, active: true },
    { id: 'leaderboard:D7', title: '过去7天', isWeb: false, active: true },
    { id: 'leaderboard:D30', title: '过去30天', isWeb: false, active: true },
    { id: 'random', title: '随机本子', isWeb: false, active: true },
];

/**
 * 生成签名
 */
function generateSignature(path, method, time) {
    const raw = (path + time + NONCE + method + API_KEY).toLowerCase();
    console.log('[pikapika] signature raw: ' + raw);
    // 使用 HMAC-SHA256 签名
    if (runtime.crypto && typeof runtime.crypto.hmacSha256 === 'function') {
        const sig = runtime.crypto.hmacSha256(raw, SECRET_KEY);
        console.log('[pikapika] signature (hmacSha256): ' + sig);
        return sig;
    } else {
        console.log('[pikapika] ERROR: hmacSha256 not available!');
        throw new Error('hmacSha256 not available');
    }
}

/**
 * 获取API URL
 * 如果 USE_SWITCH 为 true，使用分流IP；否则直接使用域名
 */
let USE_SWITCH = false;  // 可通过表单配置
let CURRENT_SWITCH = DEFAULT_SWITCH;
let CUSTOM_SWITCH_IP = '';

function getApiUrl(path) {
    if (USE_SWITCH) {
        const switchIp = CUSTOM_SWITCH_IP || SWITCH_ADDRESSES[CURRENT_SWITCH] || SWITCH_ADDRESSES[3];
        return `https://${switchIp}/${path}`;
    }
    return `https://${API_HOST}/${path}`;
}

/**
 * 获取通用请求头
 */
function getHeaders(path, method) {
    const time = Math.floor(Date.now() / 1000).toString();
    const signature = generateSignature(path, method, time);
    
    console.log('[pikapika] getHeaders: path=' + path + ', method=' + method + ', time=' + time);
    
    const headers = {
        'api-key': API_KEY,
        'accept': 'application/vnd.picacomic.com.v1+json',
        'app-channel': '2',
        'time': time,
        'nonce': NONCE,
        'signature': signature,
        'app-version': '2.2.1.2.3.3',
        'app-uuid': 'defaultUuid',
        'app-platform': 'android',
        'app-build-version': '44',
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'okhttp/3.8.1',
        'image-quality': 'original'
    };
    
    // 使用分流IP时需要添加 Host header
    if (USE_SWITCH) {
        headers['Host'] = API_HOST;
    }
    
    return headers;
}

/**
 * 获取带授权的请求头
 */
async function getAuthHeaders(path, method) {
    console.log('[pikapika] getAuthHeaders: path=' + path);
    const headers = getHeaders(path, method);
    const token = await runtime.storage.get('pikapika_token');
    console.log('[pikapika] token exists: ' + (!!token));
    if (token) {
        headers['authorization'] = token;
    }
    return headers;
}

/**
 * 检查 token 是否有效（参考原版 preLogin 逻辑）
 * token 有 24 小时有效期
 */
async function isTokenValid() {
    const token = await runtime.storage.get('pikapika_token');
    if (!token) return false;
    
    const tokenTime = await runtime.storage.get('pikapika_token_time');
    if (!tokenTime) return false;
    
    const tokenTimestamp = parseInt(tokenTime) || 0;
    const now = Date.now();
    
    // 如果 token 未过期（24小时内），则有效
    return (now - tokenTimestamp) < TOKEN_EXPIRE_MS;
}

/**
 * 预登录（参考原版 preLogin 逻辑）
 * 如果有有效 token 则直接使用，否则尝试重新登录
 * 如果没有账号密码，抛出需要登录的错误
 */
async function preLogin() {
    console.log('[pikapika] preLogin called');
    // 初始化分流设置
    try {
        const use = await runtime.storage.get('pikapika_use_switch');
        USE_SWITCH = use === '1' || use === true || use === 'true';
        const idx = await runtime.storage.get('pikapika_switch');
        if (idx) {
            const n = parseInt(idx);
            if (!isNaN(n)) CURRENT_SWITCH = n;
        }
        const ip = await runtime.storage.get('pikapika_switch_ip');
        if (ip) CUSTOM_SWITCH_IP = ip;
    } catch (e) { console.log('[pikapika] init switch failed:', e.message); }
    // 检查现有 token 是否有效
    if (await isTokenValid()) {
        console.log('[pikapika] token is valid');
        return true;
    }
    
    // 尝试使用保存的账号密码登录
    const username = await runtime.storage.get('username');
    const password = await runtime.storage.get('password');
    
    if (username && password) {
        try {
            console.log('[pikapika] trying auto login...');
            await login(username, password);
            return true;
        } catch (e) {
            console.log('[pikapika] auto login failed: ' + e.message);
            throw new Error('登录失败: ' + e.message);
        }
    }
    
    // 没有账号密码，抛出需要登录的错误
    throw new Error('需要设定用户名和密码');
}

/**
 * API 请求
 */
async function apiRequest(path, method = 'GET', body = null) {
    console.log('[pikapika] apiRequest: ' + method + ' ' + path);
    const url = getApiUrl(path);
    const headers = await getAuthHeaders(path, method);
    
    let response;
    if (method === 'GET') {
        response = await runtime.http.get(url, headers);
    } else {
        // 注意：runtime.http.post 参数顺序是 (url, headers, body)
        const bodyStr = body ? JSON.stringify(body) : '';
        response = await runtime.http.post(url, headers, bodyStr);
    }
    
    console.log('[pikapika] response status: ' + response.status);
    console.log('[pikapika] response body: ' + (response.body || '').substring(0, 500));
    
    if (response.error) {
        throw new Error(response.error);
    }
    
    if (response.status !== 200) {
        throw new Error(`API error: ${response.status}`);
    }
    
    const data = JSON.parse(response.body);
    if (data.code !== 200) {
        console.log('[pikapika] API error code: ' + data.code + ', message: ' + (data.message || 'unknown'));
        throw new Error(data.message || 'Unknown error');
    }
    
    return data.data;
}

/**
 * 转换远程图片信息
 * 注意：pikapika 的图片 URL 格式是 fileServer + "/static/" + path
 */
function toRemoteImageInfo(thumb) {
    if (!thumb) {
        return {
            original_name: '',
            path: '',
            file_server: '',
            headers: {}
        };
    }
    // 图片路径需要添加 /static/ 前缀
    const path = thumb.path || '';
    return {
        original_name: thumb.originalName || '',
        path: path ? '/static/' + path : '',
        file_server: thumb.fileServer || '',
        headers: {}
    };
}

/**
 * 转换漫画简略信息
 */
function toComicSimple(comic) {
    return {
        id: comic._id,
        title: comic.title,
        author: comic.author || '',
        pages_count: comic.pagesCount || 0,
        eps_count: comic.epsCount || 0,
        finished: comic.finished || false,
        categories: comic.categories || [],
        thumb: toRemoteImageInfo(comic.thumb),
        likes_count: comic.likesCount || 0
    };
}

/**
 * 转换漫画详情
 */
function toComicDetail(comic) {
    return {
        id: comic._id,
        title: comic.title,
        author: comic.author || '',
        pages_count: comic.pagesCount || 0,
        eps_count: comic.epsCount || 0,
        finished: comic.finished || false,
        categories: comic.categories || [],
        thumb: toRemoteImageInfo(comic.thumb),
        likes_count: comic.likesCount || 0,
        description: comic.description || '',
        chinese_team: comic.chineseTeam || '',
        tags: comic.tags || [],
        updated_at: comic.updated_at || '',
        created_at: comic.created_at || '',
        allow_download: comic.allowDownload !== false,
        views_count: comic.viewsCount || 0,
        is_favourite: comic.isFavourite || false,
        is_liked: comic.isLiked || false,
        comments_count: comic.commentsCount || 0
    };
}

/**
 * 转换章节
 * 注意：pikapika API 使用 order（数字）来获取章节图片，而不是 _id
 */
function toEp(ep) {
    return {
        id: String(ep.order || 0),  // 使用 order 作为 id，因为 getPictures 需要 order
        title: ep.title,
        order: ep.order || 0,
        updated_at: ep.updated_at || ''
    };
}

/**
 * 转换图片
 */
function toPicture(pic, index) {
    return {
        id: pic._id || `pic_${index}`,
        media: toRemoteImageInfo(pic.media)
    };
}

// ============ 模块接口实现 ============

/**
 * 获取分类列表
 */
async function getCategories() {
    // 检查是否已登录
    const token = await runtime.storage.get('pikapika_token');
    if (!token) {
        // 未登录时只返回内置分类
        return BUILT_IN_CATEGORIES.map(cat => ({
            id: cat.id,
            title: cat.title,
            description: '',
            thumb: null,
            is_web: cat.isWeb || false,
            active: cat.active !== false,
            link: null
        }));
    }
    
    try {
        const data = await apiRequest('categories', 'GET');
        const categories = (data && data.categories) || [];
        
        const result = [];
        
        // 添加内置分类
        for (const cat of BUILT_IN_CATEGORIES) {
            result.push({
                id: cat.id,
                title: cat.title,
                description: '',
                thumb: null,
                is_web: cat.isWeb || false,
                active: cat.active !== false,
                link: null
            });
        }
        
        // 添加服务器分类
        for (const cat of categories) {
            if (cat.isWeb) continue; // 跳过网页链接
            
            result.push({
                id: cat.title, // 使用 title 作为 ID
                title: cat.title,
                description: cat.description || '',
                thumb: toRemoteImageInfo(cat.thumb),
                is_web: cat.isWeb || false,
                active: cat.active !== false,
                link: cat.link || null
            });
        }
        
        return result;
    } catch (e) {
        // API 错误时返回内置分类
        return BUILT_IN_CATEGORIES.map(cat => ({
            id: cat.id,
            title: cat.title,
            description: '',
            thumb: null,
            is_web: cat.isWeb || false,
            active: cat.active !== false,
            link: null
        }));
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
 */
async function getComics(params) {
    // 先检查登录状态
    await preLogin();
    
    const { categorySlug, sortBy, page } = params;
    
    // 处理特殊分类
    if (categorySlug.startsWith('leaderboard:')) {
        const type = categorySlug.split(':')[1];
        const data = await apiRequest(`comics/leaderboard?tt=${type}&ct=VC`, 'GET');
        const comics = data.comics || [];
        
        return {
            total: comics.length,
            limit: comics.length,
            page: 1,
            pages: 1,
            docs: comics.map(toComicSimple)
        };
    }
    
    if (categorySlug === 'random') {
        const data = await apiRequest('comics/random', 'GET');
        const comics = data.comics || [];
        
        return {
            total: comics.length,
            limit: comics.length,
            page: 1,
            pages: 1,
            docs: comics.map(toComicSimple)
        };
    }
    
    // 普通分类
    const sort = sortBy || 'ua';
    const queryParams = `c=${encodeURIComponent(categorySlug)}&s=${sort}&page=${page}`;
    const data = await apiRequest(`comics?${queryParams}`, 'GET');
    const comicsData = data.comics || {};
    
    return {
        total: comicsData.total || 0,
        limit: comicsData.limit || 20,
        page: comicsData.page || page,
        pages: comicsData.pages || 0,
        docs: (comicsData.docs || []).map(toComicSimple)
    };
}

/**
 * 获取漫画详情
 */
async function getComicDetail(params) {
    await preLogin();
    const { comicId } = params;
    const data = await apiRequest(`comics/${comicId}`, 'GET');
    return toComicDetail(data.comic);
}

/**
 * 获取章节列表
 */
async function getEps(params) {
    await preLogin();
    const { comicId, page } = params;
    const data = await apiRequest(`comics/${comicId}/eps?page=${page}`, 'GET');
    const epsData = data.eps || {};
    
    return {
        total: epsData.total || 0,
        limit: epsData.limit || 40,
        page: epsData.page || page,
        pages: epsData.pages || 0,
        docs: (epsData.docs || []).map(toEp)
    };
}

/**
 * 获取章节图片
 */
async function getPictures(params) {
    await preLogin();
    const { comicId, epId, page } = params;
    // epId 实际上是 epOrder
    const epOrder = parseInt(epId) || 1;
    console.log('[pikapika] getPictures: comicId=' + comicId + ', epOrder=' + epOrder + ', page=' + page);
    const data = await apiRequest(`comics/${comicId}/order/${epOrder}/pages?page=${page}`, 'GET');
    console.log('[pikapika] getPictures data: ' + JSON.stringify(data).substring(0, 500));
    const pagesData = data.pages || {};
    
    const result = {
        total: pagesData.total || 0,
        limit: pagesData.limit || 40,
        page: pagesData.page || page,
        pages: pagesData.pages || 0,
        docs: (pagesData.docs || []).map((pic, idx) => toPicture(pic, idx))
    };
    console.log('[pikapika] getPictures result: ' + JSON.stringify(result).substring(0, 500));
    return result;
}

/**
 * 搜索漫画
 */
async function search(params) {
    await preLogin();
    const { keyword, sortBy, page } = params;
    const sort = sortBy || 'ua';
    
    const body = {
        keyword: keyword,
        sort: sort,
        categories: []
    };
    
    const data = await apiRequest(`comics/advanced-search?page=${page}`, 'POST', body);
    const comicsData = data.comics || {};
    
    return {
        total: comicsData.total || 0,
        limit: comicsData.limit || 20,
        page: comicsData.page || page,
        pages: comicsData.pages || 0,
        docs: (comicsData.docs || []).map(toComicSimple)
    };
}

// ============ 登录相关 ============

/**
 * 登录（参考原版 login 逻辑）
 */
async function login(email, password) {
    const path = 'auth/sign-in';
    const url = getApiUrl(path);
    const headers = getHeaders(path, 'POST');
    const body = JSON.stringify({ email, password });
    
    console.log('[pikapika] login url: ' + url);
    // 注意：runtime.http.post 参数顺序是 (url, headers, body)
    const response = await runtime.http.post(url, headers, body);
    
    console.log('[pikapika] login response status: ' + response.status);
    console.log('[pikapika] login response body: ' + (response.body || '').substring(0, 500));
    
    if (response.error) {
        throw new Error(response.error);
    }
    
    const data = JSON.parse(response.body);
    
    if (data.code !== 200) {
        throw new Error(data.message || 'Login failed');
    }
    
    const token = data.data.token;
    
    // 保存 token 和时间戳（参考原版）
    await runtime.storage.set('pikapika_token', token);
    await runtime.storage.set('pikapika_token_time', Date.now().toString());
    
    // 保存用户名密码以便自动重新登录
    await runtime.storage.set('username', email);
    await runtime.storage.set('password', password);
    
    return { success: true };
}

// 认证表单定义与提交
const authForm = {
    fields: [
        { key: 'username', type: 'text', label: '账号', placeholder: '邮箱/账号' },
        { key: 'password', type: 'password', label: '密码', placeholder: '请输入密码' },
        {
            key: 'pikapika_switch',
            type: 'select',
            label: '分流',
            options: Object.keys(SWITCH_ADDRESSES).map(k => ({ label: `分流${k} (${SWITCH_ADDRESSES[k]})`, value: String(k) })),
            allowCustom: true,
            customKey: 'pikapika_switch_ip',
            placeholder: '可自定义IP'
        }
    ]
};

async function submitAuthForm(values) {
    try {
        const username = values.username || '';
        const password = values.password || '';
        const switchIndex = values.pikapika_switch || '';
        const switchIp = values.pikapika_switch_ip || '';

        if (switchIp) {
            await runtime.storage.set('pikapika_switch_ip', switchIp);
            CUSTOM_SWITCH_IP = switchIp;
            USE_SWITCH = true;
            await runtime.storage.set('pikapika_use_switch', '1');
        } else if (switchIndex) {
            await runtime.storage.set('pikapika_switch', switchIndex);
            CURRENT_SWITCH = parseInt(switchIndex) || DEFAULT_SWITCH;
            USE_SWITCH = true;
            await runtime.storage.set('pikapika_use_switch', '1');
        }
        if (username) await runtime.storage.set('username', username);
        if (password) await runtime.storage.set('password', password);

        let loginAttempt = false;
        let loginSuccess = false;
        if (username && password) {
            loginAttempt = true;
            try {
                const rsp = await login(username, password);
                loginSuccess = !!(rsp && rsp.success);
            } catch (e) {
                loginSuccess = false;
            }
        }
        return { success: true, loginAttempt, loginSuccess };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

function getAuthForm() {
    return authForm;
}

async function getAuthValues() {
    const username = await runtime.storage.get('username');
    const password = await runtime.storage.get('password');
    const useSwitch = await runtime.storage.get('pikapika_use_switch');
    const switchIndex = await runtime.storage.get('pikapika_switch');
    const switchIp = await runtime.storage.get('pikapika_switch_ip');
    return {
        username: username || '',
        password: password || '',
        pikapika_switch: (useSwitch ? (switchIndex || '') : ''),
        pikapika_switch_ip: (useSwitch && switchIp) ? switchIp : ''
    };
}

/**
 * 检查登录状态
 */
async function isLoggedIn() {
    const token = await runtime.storage.get('pikapika_token');
    return !!token;
}

/**
 * 登出（参考原版 clearToken 逻辑）
 */
async function logout() {
    await runtime.storage.remove('pikapika_token');
    await runtime.storage.remove('pikapika_token_time');
    // 不清除 username 和 password，方便下次登录
    return { success: true };
}

// 导出模块
const module = {
    moduleInfo,
    preLogin,  // 预登录（检查 token 有效性并自动登录）
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
    authForm,
    submitAuthForm,
    getAuthForm,
    getAuthValues
};

// 兼容导出
if (typeof exports !== 'undefined') {
    Object.assign(exports, module);
}
