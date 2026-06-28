const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent');
const logger = require('../utils/logger');

/**
 * Login agent/admin
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate request
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password'
      });
    }

    // Find agent
    const agent = await Agent.findByEmail(email);
    if (!agent) {
      logger.warn(`Failed login attempt: Email ${email} not found`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await Agent.verifyPassword(agent, password);
    if (!isMatch) {
      logger.warn(`Failed login attempt: Incorrect password for ${email}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: agent.id, 
        role: agent.role,
        email: agent.email 
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Remove password from response
    delete agent.password_hash;

    logger.info(`Agent logged in: ${agent.email} (${agent.role})`);

    res.json({
      success: true,
      token,
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role
      }
    });

  } catch (error) {
    logger.error('Login Error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
};

/**
 * Get current user
 */
exports.getMe = async (req, res) => {
  try {
    // req.agent is populated by auth middleware
    if (!req.agent) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized'
      });
    }

    res.json({
      success: true,
      agent: req.agent
    });
  } catch (error) {
    logger.error('GetMe Error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};