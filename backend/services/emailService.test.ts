import nodemailer from 'nodemailer';
import { jest, beforeAll, beforeEach, afterAll, describe, test, expect } from '@jest/globals';
import { emailService } from './emailService';

jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn() } }));
jest.mock('../utils/logger.js', () => ({ __esModule: true, default: { info: jest.fn() } }));

const sendMail = jest.fn<(mail: nodemailer.SendMailOptions) => Promise<{messageId: string}>>()
  .mockResolvedValue({ messageId: 'local-render-only' });
const originalEnv = { ...process.env };
beforeAll(() => {
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_USER = 'sender@example.test';
  process.env.SMTP_PASS = 'fixture-only';
  process.env.PUBLIC_FRONTEND_URL = 'https://example.test';
  jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as unknown as nodemailer.Transporter);
});
beforeEach(() => { sendMail.mockClear(); process.env.EMAIL_FROM = 'PrepTalk <sender@example.test>'; });
afterAll(() => { process.env = originalEnv; });

describe('transactional email branding without delivery', () => {
  test('all four auth templates preserve their payload while replacing visible identity', async () => {
    await emailService.sendOtpEmail('recipient@example.test', 'Fixture', '123456');
    await emailService.sendWelcomeEmail('recipient@example.test', 'Fixture');
    await emailService.sendPasswordResetEmail('recipient@example.test', 'Fixture', 'https://example.test/reset-password?token=fixture');
    await emailService.sendPasswordChangedEmail('recipient@example.test', 'Fixture');
    expect(sendMail).toHaveBeenCalledTimes(4);
    for (const [mail] of sendMail.mock.calls) {
      expect(mail.from).toEqual({ name: 'Aptlyra', address: 'sender@example.test' });
      expect(mail.subject).toContain('Aptlyra');
      expect(mail.html).toContain('aria-label="Aptlyra monogram"');
      expect(mail.html).toMatch(/font-size:14px;">A<\/span>/);
      expect(`${mail.subject} ${mail.html} ${mail.text}`).not.toMatch(/TechVera|PrepTalk|\bAva\b/i);
    }
    expect(sendMail.mock.calls[0][0].html).toContain('123456');
    expect(sendMail.mock.calls[1][0].html).toContain('Lyra');
    expect(sendMail.mock.calls[1][0].html).toContain('href="https://example.test"');
    expect(sendMail.mock.calls[2][0].text).toContain('token=fixture');
  });
  test('preserves bare addresses and the SMTP mailbox fallback', async () => {
    process.env.EMAIL_FROM = 'other@example.test';
    await emailService.sendWelcomeEmail('recipient@example.test', 'Fixture');
    expect(sendMail.mock.calls[0][0].from).toEqual({ name: 'Aptlyra', address: 'other@example.test' });
    delete process.env.EMAIL_FROM;
    await emailService.sendWelcomeEmail('recipient@example.test', 'Fixture');
    expect(sendMail.mock.calls[1][0].from).toEqual({ name: 'Aptlyra', address: 'sender@example.test' });
  });
  test('rejects multiple mailboxes and header injection before delivery', async () => {
    for (const from of ['one@example.test,two@example.test', 'sender@example.test\r\nBcc:other@example.test']) {
      process.env.EMAIL_FROM = from;
      await expect(emailService.sendWelcomeEmail('recipient@example.test', 'Fixture')).rejects.toThrow('one valid sender mailbox');
    }
    expect(sendMail).not.toHaveBeenCalled();
  });
});
