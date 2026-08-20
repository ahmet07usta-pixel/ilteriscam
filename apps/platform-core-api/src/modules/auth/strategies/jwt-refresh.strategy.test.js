const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { extractRefreshToken } = require('./jwt-refresh.strategy.ts');

test('extractRefreshToken prefers a refresh token from the cookie', () => {
  const request = {
    body: { refreshToken: 'body-token' },
    cookies: { refreshToken: 'cookie-token' },
  };

  assert.equal(extractRefreshToken(request), 'cookie-token');
});

test('extractRefreshToken falls back to the request body', () => {
  const request = {
    body: { refreshToken: 'body-token' },
    cookies: {},
  };

  assert.equal(extractRefreshToken(request), 'body-token');
});

test('extractRefreshToken falls back to the authorization header', () => {
  const request = {
    body: {},
    cookies: {},
    headers: { authorization: 'Bearer header-token' },
  };

  assert.equal(extractRefreshToken(request), 'header-token');
});
