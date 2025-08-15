import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import logger from '../utils/logger';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      logger.warn('Validation error', { 
        error: error.details[0].message,
        path: req.path,
        method: req.method 
      });
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.details[0].message
      });
    }
    
    next();
  };
};

export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.params);
    
    if (error) {
      logger.warn('Parameter validation error', { 
        error: error.details[0].message,
        path: req.path 
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid parameters',
        details: error.details[0].message
      });
    }
    
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.query);
    
    if (error) {
      logger.warn('Query validation error', { 
        error: error.details[0].message,
        path: req.path 
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        details: error.details[0].message
      });
    }
    
    next();
  };
};