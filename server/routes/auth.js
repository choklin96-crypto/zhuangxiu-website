const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

// 生成6位验证码
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送验证码（模拟模式）
function sendSMS(phone, code) {
  if (process.env.SMS_MODE === 'mock') {
    console.log(`[模拟短信] 发送验证码 ${code} 到 ${phone}`);
    return true;
  }
  // TODO: 接入真实短信服务（阿里云/腾讯云）
  return false;
}

// ==================== 发送验证码 ====================
router.post('/send-code', (req, res) => {
  try {
    const { phone, type } = req.body;

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: '请输入正确的手机号' });
    }

    // 检查发送频率（60秒内不能重复发送）
    const recentCode = db.prepare(`
      SELECT * FROM verification_codes
      WHERE phone = ? AND created_at > datetime('now', '-1 minute')
      ORDER BY created_at DESC LIMIT 1
    `).get(phone);

    if (recentCode) {
      return res.status(429).json({ success: false, message: '请60秒后再试' });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期

    // 保存验证码
    db.prepare(`
      INSERT INTO verification_codes (phone, code, type, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(phone, code, type || 'login', expiresAt.toISOString());

    // 发送短信
    const sent = sendSMS(phone, code);

    if (sent) {
      res.json({ success: true, message: '验证码已发送' });
    } else {
      res.status(500).json({ success: false, message: '短信发送失败' });
    }
  } catch (error) {
    console.error('发送验证码错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 验证码登录 ====================
router.post('/login-sms', (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ success: false, message: '请输入手机号和验证码' });
    }

    // 验证验证码
    const record = db.prepare(`
      SELECT * FROM verification_codes
      WHERE phone = ? AND code = ? AND type = 'login' AND used = 0
      AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(phone, code);

    if (!record) {
      return res.status(400).json({ success: false, message: '验证码错误或已过期' });
    }

    // 标记验证码已使用
    db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);

    // 查找或创建用户
    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

    if (!user) {
      // 自动注册
      const result = db.prepare(`
        INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)
      `).run(phone, '', `用户${phone.slice(-4)}`);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

      // 创建免费订阅
      db.prepare(`
        INSERT INTO subscriptions (user_id, plan_type, start_date, end_date, status)
        VALUES (?, 'free', datetime('now'), datetime('now', '+30 days'), 'active')
      `).run(user.id);
    }

    // 生成JWT
    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname
        }
      }
    });
  } catch (error) {
    console.error('验证码登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 密码注册 ====================
router.post('/register', (req, res) => {
  try {
    const { phone, password, code } = req.body;

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: '请输入正确的手机号' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: '密码至少6位' });
    }

    // 验证验证码
    const record = db.prepare(`
      SELECT * FROM verification_codes
      WHERE phone = ? AND code = ? AND type = 'register' AND used = 0
      AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(phone, code);

    if (!record) {
      return res.status(400).json({ success: false, message: '验证码错误或已过期' });
    }

    // 检查手机号是否已注册
    const existingUser = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (existingUser) {
      return res.status(400).json({ success: false, message: '该手机号已注册' });
    }

    // 标记验证码已使用
    db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);

    // 加密密码
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 创建用户
    const result = db.prepare(`
      INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)
    `).run(phone, hashedPassword, `用户${phone.slice(-4)}`);

    // 创建免费订阅
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan_type, start_date, end_date, status)
      VALUES (?, 'free', datetime('now'), datetime('now', '+30 days'), 'active')
    `).run(result.lastInsertRowid);

    res.json({ success: true, message: '注册成功' });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 密码登录 ====================
router.post('/login', (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: '请输入手机号和密码' });
    }

    // 查找用户
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

    if (!user) {
      return res.status(400).json({ success: false, message: '用户不存在' });
    }

    // 验证密码
    if (!user.password || !bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ success: false, message: '密码错误' });
    }

    // 生成JWT
    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname
        }
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 获取用户信息 ====================
router.get('/user-info', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, phone, nickname, created_at FROM users WHERE id = ?').get(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 获取订阅信息
    const subscription = db.prepare(`
      SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'
      ORDER BY end_date DESC LIMIT 1
    `).get(user.id);

    res.json({
      success: true,
      data: {
        user,
        subscription: subscription || { plan_type: 'free' }
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// JWT验证中间件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: '登录已过期，请重新登录' });
    }
    req.user = user;
    next();
  });
}

module.exports = router;
