const request = require("supertest");
const app = require("./service");
const {
  randomName,
  authenticatedRequest,
  registerUser,
  createAdminUser,
} = require("./testHelper");

// Test User variables
let testUser;
let testUserAuthToken;
let testUserId;
let authRequest;
// Admin variables
let adminRes;
let newFranchise;
let adminLoginRes;

beforeAll(async () => {
  try {
    // Create regular test user
    const userSetup = await registerUser(app, {
      name: "pizza diner",
      email: randomName() + "@test.com",
      password: "a",
    });

    testUser = userSetup.user;
    testUserAuthToken = userSetup.token;
    testUserId = userSetup.userId;
    authRequest = authenticatedRequest(app, testUserAuthToken);
  } catch (error) {
    console.error("Setup failed:", error);
  }
  try {
    // Login with the seeded admin
    adminRes = await createAdminUser();
    // console.log(adminUser);

    newFranchise = {
      name: randomName(),
      admins: [{ email: adminRes.user.email }],
      stores: [{ id: randomName(), name: randomName(), totalRevenue: 1000 }],
    };

    adminLoginRes = await request(app).put("/api/auth").send(adminRes.user);
  } catch (error) {
    console.error("Setup failed:", error);
  }
});

// Basic service tests (no auth needed)
test("root endpoint", async () => {
  const res = await request(app).get("/");
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty("version");
});

test("docs endpoint", async () => {
  // ... your docs test
});

test("404 for unknown endpoint", async () => {
  // ... your 404 test
});

// Auth tests (no beforeEach - they handle their own auth)
describe("Auth tests", () => {
  test("login", async () => {
    const loginRes = await request(app).put("/api/auth").send(testUser);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toMatch(
      /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
    );

    const { password, ...user } = { ...testUser, roles: [{ role: "diner" }] };
    expect(loginRes.body.user).toMatchObject(user);
  });

  test("registerNewUser", async () => {
    const newUser = {
      name: "new user",
      email: randomName() + "@test.com",
      password: "b",
    };
    const registerRes = await request(app).post("/api/auth").send(newUser);
    expect(registerRes.status).toBe(200);
  });

  test("logout", async () => {
    // Create fresh login just for this test
    const loginRes = await request(app).put("/api/auth").send(testUser);
    const tempAuthRequest = authenticatedRequest(app, loginRes.body.token);

    const logoutRes = await tempAuthRequest.delete("/api/auth");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe("logout successful");
  });
});

// User tests (use beforeEach for fresh tokens)
describe("User tests", () => {
  let userAuthRequest;

  beforeEach(async () => {
    const loginRes = await request(app).put("/api/auth").send({
      email: testUser.email,
      password: "a",
    });
    userAuthRequest = authenticatedRequest(app, loginRes.body.token);
  });

  test("getUser", async () => {
    const res = await userAuthRequest.get("/api/user/me");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", testUserId);
    expect(res.body).toHaveProperty("name", testUser.name);
    expect(res.body).toHaveProperty("email", testUser.email);
    expect(res.body).toHaveProperty("roles");
    expect(Array.isArray(res.body.roles)).toBe(true);
  });

  test("updateUser", async () => {
    const userData = {
      name: "Updated Name",
      email: "updated@test.com",
      password: "newpassword",
    };

    const res = await userAuthRequest
      .put(`/api/user/${testUserId}`)
      .send(userData);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("id");
    expect(typeof res.body.user.id).toBe("number");
    expect(res.body.user).toHaveProperty("name", userData.name);
    expect(res.body.user).toHaveProperty("email", userData.email);
    expect(res.body).toHaveProperty("token");
  });
});

// Franchise tests (use beforeEach for fresh admin tokens)
describe("Franchise tests", () => {
  test("getFranchises", async () => {
    const res = await request(app).get("/api/franchise");
    expect(res.status).toBe(200);
    // The response should be an array with [franchises, more]
    expect(res.body).toHaveProperty("franchises");
    expect(res.body).toHaveProperty("more");
    expect(Array.isArray(res.body.franchises)).toBe(true);
    expect(typeof res.body.more).toBe("boolean");
    const franchises = res.body.franchises;
    // Test the actual franchises data
    if (franchises.length > 0) {
      expect(franchises[0]).toHaveProperty("id");
      expect(franchises[0]).toHaveProperty("name");
    }
  });

  test("franchiseOperations", async () => {
    //   Create
    const franchiseRes = await request(app)
      .post("/api/franchise")
      .set("Authorization", `Bearer ${adminLoginRes.body.token}`)
      .send(newFranchise);
    expect(franchiseRes.status).toBe(200);
    //  Get Franchises from user
    const getFranchiseRes = await request(app)
      .get(`/api/franchise/${adminRes.id}`)
      .set("Authorization", `Bearer ${adminLoginRes.body.token}`);
    expect(getFranchiseRes.status).toBe(200);
    expect(Array.isArray(getFranchiseRes.body)).toBe(true);
    //  Delete
    const deleteRes = await request(app).delete(
      `/api/franchise/${franchiseRes.id}`
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toHaveProperty("message", "franchise deleted");
  });
});

// Order Tests
describe("Order tests", () => {
  test("get menu", async () => {
    const menuRes = await request(app).get("/api/order/menu");
    expect(menuRes.status).toBe(200);
  });

  test("add menu item", async () => {
    // Define the menu item to add
    const newMenuItem = {
      title: "Veggie Supreme",
      description: "A delicious vegetarian pizza with all the fixings",
      image: "pizza9.png",
      price: 0.0068,
    };

    const addMenuRes = await request(app)
      .put("/api/order/menu")
      .set("Authorization", `Bearer ${adminLoginRes.body.token}`)
      .send(newMenuItem);

    expect(addMenuRes.status).toBe(200);

    // Since the response is the entire menu (array), test it properly
    expect(Array.isArray(addMenuRes.body)).toBe(true);

    // Find the item we just added in the returned menu
    const addedItem = addMenuRes.body.find(
      (item) => item.title === newMenuItem.title
    );
    expect(addedItem).toBeDefined();
    expect(addedItem).toHaveProperty("title", newMenuItem.title);
    expect(addedItem).toHaveProperty("description", newMenuItem.description);
    expect(addedItem).toHaveProperty("image", newMenuItem.image);
    expect(addedItem).toHaveProperty("price", newMenuItem.price);
    expect(addedItem).toHaveProperty("id"); // Should have an ID assigned

    // Verify the item was actually added by getting the menu separately
    const menuRes = await request(app).get("/api/order/menu");
    expect(menuRes.status).toBe(200);

    // Check that our new item is in the menu
    const menuItems = menuRes.body;
    const verifyItem = menuItems.find(
      (item) => item.title === newMenuItem.title
    );
    expect(verifyItem).toBeDefined();
    expect(verifyItem.description).toBe(newMenuItem.description);
    expect(verifyItem.price).toBe(newMenuItem.price);
  });

  test("get orders", async () => {
    const getOrdersRes = await request(app)
      .get("/api/order")
      .set("Authorization", `bearer ${testUserAuthToken}`);
    expect(getOrdersRes.status).toBe(200);
  });

  test("create order", async () => {
    // First, get the menu to see what items are available
    const menuRes = await request(app).get("/api/order/menu");
    const menuItems = menuRes.body;

    // Make sure we have at least one menu item
    if (menuItems.length === 0) {
      // Add a menu item first if none exist
      await request(app)
        .put("/api/order/menu")
        .set("Authorization", `Bearer ${adminLoginRes.body.token}`)
        .send({
          title: "Test Pizza",
          description: "For testing orders",
          image: "test.png",
          price: 0.005,
        });

      // Get updated menu
      const updatedMenuRes = await request(app).get("/api/order/menu");
      menuItems = updatedMenuRes.body;
    }

    const newOrder = {
      franchiseId: 1, // ID of the franchise
      storeId: "1", // ID of the store within the franchise
      items: [
        {
          menuId: menuItems[0].id, // Reference to menu item
          description: "Large", // Size or customization
          price: menuItems[0].price, // Price of this item
        },
        {
          menuId: menuItems[0].id,
          description: "Medium",
          price: menuItems[0].price * 0.8, // Different price for medium
        },
      ],
    };

    const createOrderRes = await request(app)
      .post("/api/order")
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .send(newOrder);

    expect(createOrderRes.status).toBe(200);
    expect(createOrderRes.body).toHaveProperty("order");
    expect(createOrderRes.body.order).toHaveProperty("id");
    expect(createOrderRes.body.order).toHaveProperty("items");
    expect(createOrderRes.body.order.items).toHaveLength(2);
    expect(createOrderRes.body.order).toHaveProperty(
      "franchiseId",
      newOrder.franchiseId
    );
    expect(createOrderRes.body.order).toHaveProperty(
      "storeId",
      newOrder.storeId
    );
  });
});
