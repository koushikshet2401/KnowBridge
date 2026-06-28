const { z } = require('zod');

/**
 * Validation Schemas using Zod
 * 
 * Location: backend/src/validation/schemas.js
 * 
 * Install: npm install zod
 * 
 * Validates all incoming request data to prevent bad inputs,
 * SQL injection, and data integrity issues.
 */

/**
 * Chat Schemas
 */
const chatSchemas = {
  // Start new chat
  startChat: z.object({
    body: z.object({
      message: z.string()
        .max(1000, 'Message too long (max 1000 characters)')
        .optional(),
      department: z.string()
        .max(100)
        .optional()
        .default('General Support'),
      user_id: z.string().optional(),
      user_name: z.string().max(200).optional(),
      user_email: z.string().email('Invalid email').optional()
    })
  }),

  // Send message
  sendMessage: z.object({
    body: z.object({
      chat_id: z.string().uuid('Invalid chat ID'),
      message: z.string()
        .min(1, 'Message cannot be empty')
        .max(1000, 'Message too long'),
      sender_type: z.enum(['user', 'agent', 'ai'])
        .optional()
        .default('user')
    })
  }),

  // Close chat
  closeChat: z.object({
    body: z.object({
      chat_id: z.string().uuid('Invalid chat ID'),
      rating: z.number()
        .int()
        .min(1)
        .max(5)
        .optional(),
      feedback: z.string()
        .max(500)
        .optional()
    })
  }),

  // Assign chat
  assignChat: z.object({
    params: z.object({
      chatId: z.string().uuid('Invalid chat ID')
    }),
    body: z.object({
      agentId: z.string().uuid('Invalid agent ID')
    })
  })
};

/**
 * Agent Schemas
 */
const agentSchemas = {
  // Create agent
  createAgent: z.object({
    body: z.object({
      name: z.string()
        .min(2, 'Name too short')
        .max(200, 'Name too long'),
      email: z.string()
        .email('Invalid email address'),
      role: z.enum(['admin', 'agent', 'support_staff', 'manager'])
        .default('agent'),
      password: z.string()
        .min(6, 'Password must be at least 6 characters')
        .optional(),
      status: z.enum(['active', 'inactive', 'online', 'offline', 'away'])
        .default('active')
        .optional()
    })
  }),

  // Update agent
  updateAgent: z.object({
    params: z.object({
      id: z.string().uuid('Invalid agent ID').optional(),
      agentId: z.string().uuid('Invalid agent ID').optional()
    }),
    body: z.object({
      name: z.string()
        .min(2)
        .max(200)
        .optional(),
      email: z.string()
        .email()
        .optional(),
      role: z.enum(['admin', 'agent', 'support_staff', 'manager'])
        .optional(),
      status: z.enum(['active', 'inactive', 'online', 'offline', 'away'])
        .optional()
    })
  }),

  // Delete agent
  deleteAgent: z.object({
    params: z.object({
      id: z.string().uuid('Invalid agent ID')
    })
  })
};

/**
 * Knowledge Base Schemas
 */
const knowledgeBaseSchemas = {
  // Ingest document
  ingestDocument: z.object({
    body: z.object({
      title: z.string()
        .min(1, 'Title required')
        .max(300),
      content: z.string()
        .min(10, 'Content too short')
        .max(50000, 'Content too long'),
      type: z.enum(['text', 'pdf', 'url'])
        .default('text'),
      category: z.string()
        .max(100)
        .optional()
    })
  }),

  // Query knowledge base
  queryKnowledgeBase: z.object({
    body: z.object({
      query: z.string()
        .min(3, 'Query too short')
        .max(500, 'Query too long'),
      limit: z.number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .optional(),
      threshold: z.number()
        .min(0)
        .max(1)
        .default(0.7)
        .optional()
    })
  }),

  // Delete document
  deleteDocument: z.object({
    params: z.object({
      id: z.string().uuid('Invalid document ID')
    })
  })
};

/**
 * Notification Schemas
 */
const notificationSchemas = {
  // Mark as read
  markAsRead: z.object({
    body: z.object({
      notification_ids: z.array(z.string().uuid())
        .min(1, 'At least one notification ID required')
        .max(50, 'Too many notifications at once')
    })
  })
};

/**
 * File Upload Schema
 */
const fileUploadSchema = z.object({
  file: z.object({
    mimetype: z.string()
      .refine((type) => {
        const allowed = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,application/pdf').split(',');
        return allowed.includes(type);
      }, 'File type not allowed'),
    size: z.number()
      .max(parseInt(process.env.MAX_FILE_SIZE || '5242880'), 'File too large (max 5MB)')
  })
});

/**
 * Query Parameter Schemas
 */
const querySchemas = {
  // Pagination
  pagination: z.object({
    query: z.object({
      page: z.string()
        .optional()
        .transform((val) => parseInt(val || '1', 10))
        .refine((val) => val > 0, 'Page must be positive'),
      limit: z.string()
        .optional()
        .transform((val) => parseInt(val || '20', 10))
        .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    })
  }),

  // Chat filters
  chatFilters: z.object({
    query: z.object({
      status: z.enum(['active', 'pending', 'resolved', 'closed'])
        .optional(),
      agent_id: z.string()
        .uuid()
        .optional(),
      from_date: z.string()
        .datetime()
        .optional(),
      to_date: z.string()
        .datetime()
        .optional()
    })
  })
};

const paramSchemas = {
  uuid: z.object({
    params: z.object({
      chatId: z.string().uuid('Invalid ID format').optional(),
      agentId: z.string().uuid('Invalid ID format').optional(),
      id: z.string().uuid('Invalid ID format').optional(),
      userId: z.string().optional() // Do not validate as UUID, as it can be '1' or 'guest_xxx'
    })
  })
};

module.exports = {
  chatSchemas,
  agentSchemas,
  knowledgeBaseSchemas,
  notificationSchemas,
  fileUploadSchema,
  querySchemas,
  paramSchemas
};