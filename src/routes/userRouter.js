const express = require("express");
const { asyncHandler } = require("../endpointHelper.js");
const { DB, Role } = require("../database/database.js");
const { authRouter, setAuth } = require("./authRouter.js");

const userRouter = express.Router();

userRouter.docs = [
  {
    method: "GET",
    path: "/api/user?page=1&limit=10&name=*",
    requiresAuth: true,
    description: "Gets a list of users",
    example: `curl -X GET localhost:3000/api/user -H 'Authorization: Bearer tttttt'`,
    response: {
      users: [
        {
          id: 1,
          name: "常用名字",
          email: "a@jwt.com",
          roles: [{ role: "admin" }],
        },
      ],
    },
  },
  {
    method: "GET",
    path: "/api/user/me",
    requiresAuth: true,
    description: "Get authenticated user",
    example: `curl -X GET localhost:3000/api/user/me -H 'Authorization: Bearer tttttt'`,
    response: {
      id: 1,
      name: "常用名字",
      email: "a@jwt.com",
      roles: [{ role: "admin" }],
    },
  },
  {
    method: "PUT",
    path: "/api/user/:userId",
    requiresAuth: true,
    description: "Update user",
    example: `curl -X PUT localhost:3000/api/user/1 -d '{"name":"常用名字", "email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt'`,
    response: {
      user: {
        id: 1,
        name: "常用名字",
        email: "a@jwt.com",
        roles: [{ role: "admin" }],
      },
      token: "tttttt",
    },
  },
  {
    method: "DELETE",
    path: "/api/user/:userId",
    requiresAuth: true,
    description: "Delete a user (admin only)",
    example: `curl -X DELETE localhost:3000/api/user/1 -H 'Authorization: Bearer tttttt'`,
    response: "204 No Content",
  },
  {
    method: "PUT",
    path: "/api/user/:userId/role",
    requiresAuth: true,
    description: "Admin: Update user roles",
    example: `curl -X PUT localhost:3000/api/user/2/role -d '{"roles":["admin"]}' -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt'`,
    response: {
      message: "Roles updated successfully",
      user: {
        id: 2,
        name: "User",
        roles: [{ role: "admin" }],
      },
    },
  },
];

// getUser
userRouter.get(
  "/me",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

// updateUser
userRouter.put(
  "/:userId",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userId = Number(req.params.userId);
    const user = req.user;

    // Only the user themselves or admins can edit this user
    if (user.id !== userId && !user.isRole(Role.Admin)) {
      return res.status(403).json({ message: "unauthorized" });
    }

    // Prepare data to update
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) updateData.password = password;

    // Ignore any roles in the body — they are not allowed here
    if ("roles" in req.body || "role" in req.body) {
      console.log(`Ignoring role update attempt by user ${user.id}`);
    }

    const updatedUser = await DB.updateUser(userId, updateData);
    const auth = await setAuth(updatedUser);

    res.json({ user: updatedUser, token: auth });
  })
);

// listUsers
userRouter.get(
  "/",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      return res.status(403).json({ message: "unauthorized" });
    }

    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const nameFilter = req.query.name || "*";

    const [users] = await DB.getUsers(page, limit, nameFilter);
    // const [users, hasMore] = await DB.getUsers(page, limit, nameFilter);

    // Get total count for frontend pagination
    const total = await DB.getUserCount(nameFilter);

    // Return structure that matches your UserList type
    res.json({
      users,
      page,
      total,
    });
  })
);

// deleteUser
userRouter.delete(
  "/:userId",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const user = req.user;

    // Only admins can delete users
    if (!user.isRole(Role.Admin)) {
      return res.status(403).json({ message: "unauthorized" });
    }

    // Prevent admin from deleting themselves
    if (user.id === userId) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own account" });
    }

    await DB.deleteUser(userId);
    res.status(204).send(); // 204 No Content - successful deletion, no body
  })
);

// escalateRole
userRouter.put(
  "/:userId/role",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const { roles } = req.body; // should be an array of roles
    const user = req.user;

    // 1. Only admins can change roles
    if (!user.isRole(Role.Admin)) {
      return res.status(403).json({ message: "unauthorized" });
    }

    // 2. Admin cannot modify their own roles
    if (user.id === userId) {
      return res
        .status(400)
        .json({ message: "Admins cannot modify their own roles" });
    }

    // 3. Validate roles format
    if (!Array.isArray(roles) || roles.length === 0) {
      return res
        .status(400)
        .json({ message: "Roles must be a non-empty array" });
    }

    // 4. Validate each role exists in your Role enum
    for (const r of roles) {
      if (!Object.values(Role).includes(r)) {
        return res.status(400).json({ message: `Invalid role: ${r}` });
      }
    }

    // 5. Database method to update roles
    const roleObjects = roles.map((r) => ({ role: r, objectId: 0 }));
    const updatedUser = await DB.updateUserRoles(userId, roleObjects);

    res.json({
      message: "Roles updated successfully",
      user: updatedUser,
    });
  })
);

module.exports = userRouter;
