const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimiter');

/**
 * @route   POST /api/auth/login
 * @desc    Login agent/admin and get token
 * @access  Public
 */
router.post('/login', loginLimiter, authController.login);

/**
 * @route   POST /api/auth/signup
 * @desc    Signup agent/admin
 * @access  Public
 */
router.post('/signup', authController.signup);

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
const { authenticate } = require('../middleware/auth');
router.get('/me', authenticate, authController.getMe);

module.exports = router;
