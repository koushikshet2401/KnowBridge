const pool = require('../config/database');
const logger = require('../utils/logger');

/**
 * Validates that the public request's origin matches the registered domain of the requested tenant.
 * This prevents a malicious actor from using a valid Tenant ID on an unauthorized domain
 * to query another company's AI knowledge base.
 */
const validateTenantOrigin = async (req, res, next) => {
  // Allow authenticated admin requests to bypass this check
  if (req.agent && req.tenant_id) return next();
  
  const tenantId = req.headers['x-tenant-id'] || (req.body && req.body.tenant_id);
  if (!tenantId) {
    return res.status(400).json({ success: false, error: 'Missing tenant_id in request' });
  }
  
  const origin = req.headers.origin || req.headers.referer;
  
  // Skip strict origin validation in development if no origin is provided (e.g., Postman)
  if (!origin && process.env.NODE_ENV !== 'production') {
    req.tenant_id = tenantId;
    return next();
  }

  if (!origin) {
    logger.warn(`Tenant validation failed: No origin header provided for tenant ${tenantId}`);
    return res.status(403).json({ success: false, error: 'Origin header is required for public widget access' });
  }

  try {
    // Extract raw hostname from the origin (e.g., https://abc.com/foo -> abc.com)
    let hostname;
    try {
      hostname = new URL(origin).hostname;
    } catch (e) {
      hostname = origin;
    }
    
    // Normalize localhost for testing
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      req.tenant_id = tenantId;
      return next();
    }
    
    // Normalize www.
    hostname = hostname.replace('www.', '');

    const result = await pool.query('SELECT id, domain FROM tenants WHERE id = $1', [tenantId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid Tenant ID' });
    }
    
    const tenant = result.rows[0];
    
    // Enforce origin match
    if (tenant.domain) {
       let tenantDomain = tenant.domain.replace('www.', '');
       if (tenantDomain.includes('://')) {
           try {
             tenantDomain = new URL(tenantDomain).hostname;
           } catch(e) {}
       }
       
       if (hostname !== tenantDomain) {
          logger.warn(`🚨 SECURITY: Tenant domain mismatch! Expected ${tenantDomain}, but received request from ${hostname} using Tenant ID ${tenantId}`);
          return res.status(403).json({ success: false, error: 'Unauthorized origin for this tenant.' });
       }
    } else {
       logger.warn(`Tenant validation failed: Tenant ${tenantId} has no registered domain to validate against.`);
       return res.status(403).json({ success: false, error: 'Tenant domain not configured. Access denied.' });
    }

    // Origin is valid and matches the tenant!
    req.tenant_id = tenant.id;
    next();
  } catch (error) {
    logger.error('Error validating tenant origin:', error);
    res.status(500).json({ success: false, error: 'Server error during tenant validation' });
  }
};

module.exports = { validateTenantOrigin };
