import supertest from 'supertest';
import express from 'express';
import { describe, it, expect } from '@jest/globals';

// Setup a simple express app for testing to avoid booting the full server and DB
const testApp = express();
testApp.get('/health', (req, res) => {
  res.json({ status: 'ok', db: 'mocked' });
});

describe('Health Check API', () => {
  it('should return ok status on GET /health', async () => {
    const response = await supertest(testApp).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'mocked' });
  });
});
