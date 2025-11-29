import config from "../../../config";
import prisma from "../../lib/prisma";
import { sendOTP } from "../../utils/authentica";

export const OTPPhoneFn = async (phone: string, userId: string, smsTemplate?: (code: number) => string) => {
  const OTP_EXPIRY_TIME = Number(config.otp_expiry_time) * 60 * 1000;
  const expiry = new Date(Date.now() + OTP_EXPIRY_TIME);
  const otpCode = Math.floor(1000 + Math.random() * 9000);

  // Send OTP via Authentica
  const result = await sendOTP(phone, otpCode.toString());

  if (!result.success) {
    throw new Error(result.message || 'Failed to send OTP');
  }

  const existingOtp = await prisma.oTP.findFirst({ where: { userId } });
  if (existingOtp) {
    await prisma.oTP.update({
      where: { id: existingOtp.id },
      data: { otpCode: otpCode.toString(), userId, expiry },
    });
  } else {
    await prisma.oTP.create({ data: { otpCode: otpCode.toString(), userId, expiry } });
  }
  return { otpSent: true, userId };
};
