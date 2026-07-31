// ===== 关于勇志 - 留言板 API (Vercel Serverless Function) =====
// 使用 GitHub Gist 作为永久存储，token 在服务端 env var 中，前端永远看不到
// GET  /api/messages  → 读取所有留言
// POST /api/messages  → 提交新留言 { name, text }

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const MAX_MESSAGES = 1000;
const MSG_MAX_LEN = 50;
const MSG_MAX_NAME = 20;

// 简易内存限流（同实例内有效，防止快速刷屏）
const _rateMap = {};
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 10000; // 10秒窗口
  const maxPerWindow = 1; // 每10秒最多1条
  const arr = _rateMap[ip] || [];
  const recent = arr.filter(t => now - t < windowMs);
  if (recent.length >= maxPerWindow) return true;
  recent.push(now);
  _rateMap[ip] = recent;
  // 清理过期
  if (Object.keys(_rateMap).length > 1000) {
    for (const k in _rateMap) {
      _rateMap[k] = _rateMap[k].filter(t => now - t < windowMs);
      if (_rateMap[k].length === 0) delete _rateMap[k];
    }
  }
  return false;
}

// 从 Gist 读取留言
async function readMessages() {
  const resp = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'about-yushi-bot'
    }
  });

  if (!resp.ok) {
    throw new Error(`GitHub API GET failed: ${resp.status}`);
  }

  const gist = await resp.json();
  const file = gist.files && gist.files['messages.json'];
  if (!file || !file.content) return [];

  try {
    const data = JSON.parse(file.content);
    return Array.isArray(data.messages) ? data.messages : [];
  } catch (e) {
    return [];
  }
}

// 写入留言到 Gist
async function writeMessages(messages) {
  const resp = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'about-yushi-bot'
    },
    body: JSON.stringify({
      files: {
        'messages.json': {
          content: JSON.stringify({ messages }, null, 2)
        }
      }
    })
  });

  if (!resp.ok) {
    throw new Error(`GitHub API PATCH failed: ${resp.status}`);
  }
}

// 解析请求体
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// 获取客户端 IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || 'unknown';
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 检查环境变量
  if (!GITHUB_TOKEN || !GIST_ID) {
    return res.status(500).json({ error: '服务器未配置：缺少 GITHUB_TOKEN 或 GIST_ID' });
  }

  try {
    // ===== GET: 读取留言 =====
    if (req.method === 'GET') {
      const messages = await readMessages();
      // 按时间倒序
      messages.sort((a, b) => new Date(b.time) - new Date(a.time));
      return res.status(200).json({ messages });
    }

    // ===== POST: 提交留言 =====
    if (req.method === 'POST') {
      const body = await parseBody(req);
      let name = (body.name || '').toString().trim();
      let text = (body.text || '').toString().trim();

      // 验证
      if (!text) {
        return res.status(400).json({ error: '留言内容不能为空' });
      }
      if (text.length > MSG_MAX_LEN) {
        return res.status(400).json({ error: `留言太长，最多${MSG_MAX_LEN}字` });
      }
      if (name.length > MSG_MAX_NAME) {
        name = name.slice(0, MSG_MAX_NAME);
      }

      // 限流
      const ip = getClientIP(req);
      if (isRateLimited(ip)) {
        return res.status(429).json({ error: '留言太频繁了，请10秒后再试' });
      }

      // 读取现有留言
      const messages = await readMessages();

      // 创建新留言
      const newMsg = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name,
        text: text,
        time: new Date().toISOString()
      };

      messages.push(newMsg);

      // 保留最新 MAX_MESSAGES 条
      let toSave = messages;
      if (messages.length > MAX_MESSAGES) {
        toSave = messages.slice(-MAX_MESSAGES);
      }

      // 写回 Gist（带重试，防并发冲突）
      let saved = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await writeMessages(toSave);
          saved = true;
          break;
        } catch (e) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          }
        }
      }

      if (!saved) {
        return res.status(502).json({ error: '保存失败，请稍后再试' });
      }

      return res.status(200).json({ success: true, message: newMsg });
    }

    return res.status(405).json({ error: '不支持的请求方式' });

  } catch (e) {
    return res.status(500).json({ error: '服务器内部错误' });
  }
};
