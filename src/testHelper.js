const request = require("supertest");
const { DB } = require("./database/database.js");
const { Role } = require("./model/model.js");

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

// Abstract user registration function
async function registerUser(app, userData = {}) {
  // Ensure required fields have defaults
  const user = {
    name: "pizza diner",
    email: `${randomName()}@test.com`,
    password: "a",
    ...userData, // This allows overriding the defaults
  };

  const response = await request(app).post("/api/auth").send(user);

  if (response.status !== 200) {
    throw new Error(`Failed to register user: ${response.body.message}`);
  }

  response.body.user.password = user.password;

  return {
    response,
    user: response.body.user, // Return the user from the response, not the input
    token: response.body.token,
    userId: response.body.user?.id,
  };
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  const result = await DB.addUser(user);

  const { id: adminId } = result;

  user.password = "toomanysecrets";
  return { user, adminId };
}

// Helper to make authenticated requests
function authenticatedRequest(app, token) {
  return {
    get: (url) => request(app).get(url).set("Authorization", `Bearer ${token}`),
    post: (url) =>
      request(app).post(url).set("Authorization", `Bearer ${token}`),
    put: (url) => request(app).put(url).set("Authorization", `Bearer ${token}`),
    delete: (url) =>
      request(app).delete(url).set("Authorization", `Bearer ${token}`),
  };
}

module.exports = {
  randomName,
  registerUser,
  authenticatedRequest,
  createAdminUser,
};
