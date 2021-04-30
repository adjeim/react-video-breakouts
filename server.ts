import * as dotenv from 'dotenv';
import express, { Request, Response } from 'express';

dotenv.config();

const port = process.env.PORT || 5000;

const app = express();
app.use(express.json());

app.use(express.json());

app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});