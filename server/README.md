# 装修零距离 - 后端服务器

## 功能

- ✅ 手机号 + 验证码登录
- ✅ 手机号 + 密码注册/登录
- ✅ 用户信息管理
- ✅ JWT token 认证
- ✅ 订阅管理（为付费功能准备）

## 安装

```bash
cd server
npm install
```

## 启动

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

## API 接口

### 发送验证码
```
POST /api/auth/send-code
Body: { "phone": "13800138000", "type": "login" }
```

### 验证码登录
```
POST /api/auth/login-sms
Body: { "phone": "13800138000", "code": "123456" }
```

### 密码注册
```
POST /api/auth/register
Body: { "phone": "13800138000", "password": "123456", "code": "123456" }
```

### 密码登录
```
POST /api/auth/login
Body: { "phone": "13800138000", "password": "123456" }
```

### 获取用户信息
```
GET /api/auth/user-info
Headers: { "Authorization": "Bearer <token>" }
```

## 短信配置

当前使用模拟模式，验证码会在控制台输出。

要接入真实短信服务，修改 `.env` 文件：
```
SMS_MODE=real
SMS_ACCESS_KEY=你的AccessKey
SMS_SECRET_KEY=你的SecretKey
SMS_SIGN_NAME=签名名称
SMS_TEMPLATE_CODE=模板代码
```

## 部署

1. 购买云服务器（阿里云/腾讯云）
2. 安装 Node.js
3. 上传代码
4. 使用 PM2 启动：
   ```bash
   npm install -g pm2
   pm2 start server.js --name zhuangxiu-server
   ```
