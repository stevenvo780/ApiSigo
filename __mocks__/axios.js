const axios = {
  create: jest.fn(() => axios),
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

module.exports = axios;
module.exports.default = axios;
