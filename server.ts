import * as dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import twilio, { Twilio } from 'twilio';

dotenv.config();

const port = process.env.PORT || 5000;
const allowedOrigins = ['http://localhost:3000'];

const app = express();
app.use(express.json());

const options: cors.CorsOptions = {
  origin: allowedOrigins
};

app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});