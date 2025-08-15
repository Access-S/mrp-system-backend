// BLOCK 1: Imports
import { Router } from 'express';
import multer from 'multer';
import { getForecasts, uploadForecasts } from '../controllers/forecast.controller';

// BLOCK 2: Middleware Setup
// Configure multer to handle file uploads in memory.
// It will look for a file in a form field named 'forecastFile'.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// BLOCK 3: Route Definitions
const router = Router();

// Defines the GET endpoint for fetching forecast data.
// e.g., GET http://localhost:3001/api/forecasts?months=4
router.get('/', getForecasts);

// Defines the POST endpoint for uploading the Excel file.
// The `upload.single('forecastFile')` middleware will process the file first,
// then pass the request to the `uploadForecasts` controller.
router.post('/upload', upload.single('forecastFile'), uploadForecasts);


// BLOCK 4: Export Router
export default router;