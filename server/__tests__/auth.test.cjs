const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit } = require('../config/db.cjs');

describe('Auth API & Token Middleware (/api/auth)', () => {
  beforeAll(async () => {
    await ensureDbInit();
  });

  it('should reject login with empty username or password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/请输入用户名和密码/);
  });

  it('should reject login with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent_user', password: 'wrong_password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/用户名或密码不正确/);
  });

  it('should login successfully with valid admin credentials and return JWT token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.username).toBe('wangzhaoyun');
    expect(res.body.user.role).toBe('admin');
  });

  it('should reject protected routes when authorization header is missing', async () => {
    const res = await request(app).get('/api/tables');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/未登录或登录已过期/);
  });

  it('should reject protected routes when token is invalid', async () => {
    const res = await request(app)
      .get('/api/tables')
      .set('Authorization', 'Bearer invalid.jwt.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/无访问权限/);
  });
});
