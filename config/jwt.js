const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateToken = (payload, options = {}) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  const userId = payload.id || payload.sub || null;
  let tokenPayload = {
    sub: userId,
    id: userId,
    email: payload.email || null,
    role: payload.role || 'customer',
    full_name: payload.full_name || payload.name || null,
    iss: 'fashion-ecommerce',
    aud: 'fashion-ecommerce-web'
  };

  // Include any extra custom fields (e.g. purpose for password reset)
  if (payload && typeof payload === 'object') {
    const extraKeys = Object.keys(payload).filter(
      k => !['id', 'sub', 'email', 'role', 'full_name', 'name', 'iss', 'aud', 'iat', 'exp'].includes(k)
    );
    for (const k of extraKeys) {
      tokenPayload[k] = payload[k];
    }
  }

  const jwtOpts = {};
  if (options.expires_at) jwtOpts.expiresIn = options.expires_at;
  else if (options.expiresIn) jwtOpts.expiresIn = options.expiresIn;
  else jwtOpts.expiresIn = process.env.JWT_EXPIRES_IN || '15m';

  return jwt.sign(tokenPayload, secret, jwtOpts);
};

/**
 * Verify token and return decoded payload or null if invalid/expired.
 * (Returns null instead of throwing to let callers decide handling.)
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

const generateFreshToken = ()=>{
    return crypto.randomBytes(40).toString('hex'); //tạo chuỗi randoom có 80 ký tự
};

module.exports = {
  generateToken,
  verifyToken,
  generateFreshToken
};
