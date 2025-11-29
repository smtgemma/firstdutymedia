import * as bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import { Secret } from 'jsonwebtoken';
import config from '../../../config';
import ApiError from '../../errors/ApiError';
import prisma from '../../lib/prisma';
import { IChangePassword, IOtp, IRegisterUser, IUserLogin, RefreshPayload } from './auth.interface ';
import { jwtHelpers } from '../../helpers/jwtHelpers';
import { Role, UserStatus } from '@prisma/client';
import { emailTemplate } from '../../utils/emailNotifications/emailHTML';
import { OTPFn } from './OTPFn';
import { OTPPhoneFn } from './OTPPhoneFn';
import { forgotEmailTemplate } from '../../utils/emailNotifications/forgotHTML';
import { createToken, verifyToken } from '../../utils/verifyToken';
import { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { firebaseAuth } from '../../../config/firebase.config';
import jwt from 'jsonwebtoken';

const createAccount = async (payload: { firstName: string; lastName: string; email: string; password: string }) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (existingUser) {
    throw new ApiError(httpStatus.CONFLICT, 'This email is already registered');
  }

  const hashedPassword: string = await bcrypt.hash(payload.password, Number(config.bcrypt_salt_rounds));

  const userData = {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email.trim(),
    password: hashedPassword,
    role: Role.USER,
    isEmailVerified: true,
    status: UserStatus.ACTIVE,
    isVerified: true,
    accountWith: 'EMAIL',
  };
  const result = await prisma.$transaction(async (transactionClient: any) => {
    const user = await transactionClient.user.create({
      data: {
        ...userData,
      },
    });
    //
    // OTPFn(payload.email, user.id, 'OTP Verification', emailTemplate);
    const newRefreshToken = jwtHelpers.generateToken(
      {
        id: user.id,
        email: user.email as string,
        role: user.role,
      },
      config.jwt.refresh_secret as string,
      config.jwt.refresh_expires_in as string
    );
    const accessToken = jwtHelpers.generateToken(
      {
        id: user.id,
        email: user.email as string,
        role: user.role,
      },
      config.jwt.access_secret as Secret,
      config.jwt.access_expires_in as string
    );
    return {
      id: user.id,
      accessToken: accessToken,
      refreshToken: newRefreshToken,
      authType: 'register',
    };
  });

  return result;
};

const verifyEmail = async (
  userId: string,
  { otpCode, fcmToken, type }: { otpCode: string; fcmToken?: string; type: string }
) => {
  // Find OTP record
  const otpRecord = await prisma.oTP.findUnique({
    where: { userId_otpCode: { userId, otpCode } },
  });

  if (!otpRecord) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP or expired OTP');
  }

  if (otpRecord.expiry < new Date()) {
    await prisma.oTP.delete({ where: { id: otpRecord.id } });
    throw new ApiError(httpStatus.REQUEST_TIMEOUT, 'OTP expired');
  }

  // Fetch user
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Optionally call external service for user_id
  let externalUserId: string | null = null;
  try {
    const response = await fetch('http://206.162.244.135:8100/api/v1/create', { method: 'POST' });
    const data = await response.json();
    externalUserId = data.user_id;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create user ID from external service');
  }

  // Transaction: update user and clean OTPs
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        status: UserStatus.ACTIVE,
        fcmToken: fcmToken ?? undefined,
      },
    }),
    prisma.oTP.deleteMany({ where: { userId } }),
  ]);

  // Generate tokens
  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwtHelpers.generateToken(
    tokenPayload,
    config.jwt.access_secret as Secret,
    config.jwt.access_expires_in as string
  );
  const refreshToken = jwtHelpers.generateToken(
    tokenPayload,
    config.jwt.refresh_secret as string,
    config.jwt.refresh_expires_in as string
  );

  // Return response
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    image: user.image,
    status: UserStatus.ACTIVE,
    isVerified: true,
    accessToken,
    refreshToken,
    message: type === 'register' ? 'Email verification successful' : 'OTP verified successfully',
  };
};

const resendOtp = async (userId: string) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User Not found');
  }

  OTPFn(existingUser.email, existingUser.id, 'Email Verification code', emailTemplate);

  // Return user details and OTP status
  return {
    userId: existingUser.id,
    otpSent: true,
    firstName: existingUser.firstName,
    lastName: existingUser.lastName,
    message: 'OTP sent successfully to your email',
  };
};
// const googleLogin = async (googleToken: string, req: Request) => {
//   const client = new OAuth2Client();

//   let ticket;

//   try {
//     ticket = await client.verifyIdToken({
//       idToken: googleToken,
//       audience: config.google.clientId,
//     });
//   } catch (err) {
//     throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid Google token');
//   }

//   const payload = ticket.getPayload();

//   if (!payload || !payload.email) {
//     throw new ApiError(httpStatus.UNAUTHORIZED, 'Google account email not found');
//   }
//   console.log('google login payload', googleToken);

//   let user = await prisma.user.findUnique({ where: { email: payload.email } });

//   const createdPassword = crypto.randomBytes(6).toString('hex');
//   const hashedPassword: string = await bcrypt.hash(createdPassword, Number(config.bcrypt_salt_rounds));

//   const fullName = payload.name || '';
//   let firstName = '';
//   let lastName = '';

//   if (fullName) {
//     const parts = fullName.trim().split(' ');
//     firstName = parts.shift() || ''; // first word
//     lastName = parts.join(' '); // remaining words
//   } else {
//     // fallback
//     firstName = payload.given_name || '';
//     lastName = payload.family_name || '';
//   }

//   if (!user) {
//     // Create user if not exists (customize fields as needed)
//     user = await prisma.user.create({
//       data: {
//         email: payload.email,
//         firstName: firstName,
//         lastName: lastName,
//         image: payload.picture || '',
//         role: Role.USER,
//         isVerified: false,
//         status: UserStatus.ACTIVE,
//         isEmailVerified: true,
//         password: hashedPassword,
//       },
//     });
//   }
//   const newRefreshToken = jwtHelpers.generateToken(
//     {
//       id: user.id,
//       email: user.email as string,
//       role: user.role,
//     },
//     config.jwt.refresh_secret as string,
//     config.jwt.refresh_expires_in as string
//   );
//   const accessToken = jwtHelpers.generateToken(
//     {
//       id: user.id,
//       email: user.email as string,
//       role: user.role,
//     },
//     config.jwt.access_secret as Secret,
//     config.jwt.access_expires_in as string
//   );
//   return {
//     id: user.id,
//     firstName: user.firstName,
//     lastName: user.lastName,
//     email: user.email,
//     role: user.role,
//     image: user.image,
//     status: user.status,
//     isVerified: user.isVerified,
//     accessToken: accessToken,
//     refreshToken: newRefreshToken,
//   };
// };
const googleLogin = async (firebaseToken: string, req: Request) => {
  // Decode Firebase token
  const decoded = jwt.decode(firebaseToken);

  if (!decoded) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid Firebase token');
  }

  const { email, name, picture, email_verified } = decoded as {
    email: string;
    name: string;
    picture: string;
    email_verified: boolean;
  };

  if (!email) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email not found in Firebase token');
  }

  // Try to find existing user
  let user = await prisma.user.findUnique({ where: { email } });

  // Prepare user data
  const createdPassword = crypto.randomBytes(6).toString('hex');
  const hashedPassword = await bcrypt.hash(createdPassword, Number(config.bcrypt_salt_rounds));

  let firstName = '';
  let lastName = '';
  if (name) {
    const parts = name.trim().split(' ');
    firstName = parts.shift() || '';
    lastName = parts.join(' ');
  }

  if (!user) {
    // Call external service to get user_id
    let externalUserId: string | null = null;
    try {
      const response = await fetch('http://206.162.244.135:8100/api/v1/create', { method: 'POST' });
      const data = await response.json();
      externalUserId = data.user_id;
    } catch (err) {
      console.error('Failed to create external user ID', err);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create user ID from external service');
    }

    // Create new user
    user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        image: picture || '',
        role: Role.USER,
        isVerified: false,
        status: UserStatus.ACTIVE,
        isEmailVerified: email_verified || false,
        password: hashedPassword,
        accountWith: 'GOOGLE',
      },
    });
  } else if (email_verified && !user.isEmailVerified) {
    // Update email verification if needed
    user = await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true },
    });
  }

  // Generate tokens
  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwtHelpers.generateToken(
    tokenPayload,
    config.jwt.access_secret as Secret,
    config.jwt.access_expires_in as string
  );
  const refreshToken = jwtHelpers.generateToken(
    tokenPayload,
    config.jwt.refresh_secret as string,
    config.jwt.refresh_expires_in as string
  );

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    image: user.image,
    status: user.status,
    isVerified: user.isVerified,
    accountWith: user.accountWith,
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: { email: string }) => {
  // Check if the user exists
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User not found');
  }

  OTPFn(user.email, user.id, 'Forgot Password OTP email', forgotEmailTemplate);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    otpSent: true,
    message: 'OTP sent successfully to your email',
    type: 'forgotPassword',
  };
};

const verifyOtp = async (payload: IOtp) => {
  const { userId, otpCode } = payload;
  const otpData = await prisma.oTP.findUnique({
    where: {
      userId_otpCode: {
        userId,
        otpCode,
      },
    },
  });
  if (!otpData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'OTP not found');
  }

  if (otpData.expiry < new Date()) {
    throw new ApiError(httpStatus.REQUEST_TIMEOUT, 'OTP expired');
  }

  await prisma.oTP.delete({
    where: {
      id: otpData.id,
    },
  });
  const accessToken = jwtHelpers.generateToken(
    {
      id: userId,
    },
    config.jwt.reset_pass_secret as Secret,
    config.jwt.reset_pass_token_expires_in as string
  );
  return { accessToken };
};

const loginUserFromDB = async (payload: IUserLogin) => {
  const userData = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });
  if (!userData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (userData.status === UserStatus.BLOCKED) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account is not active. Please contact with admin.');
  }

  const isCorrectPassword = await bcrypt.compare(payload.password, userData.password as string);

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password incorrect');
  }

  if (userData.status === UserStatus.PENDING && !userData.isEmailVerified) {
    OTPFn(userData.email, userData.id, 'OTP Verification', emailTemplate);
    return {
      id: userData.id,
      email: userData.email,
      message: 'Please verify your email. OTP sent to your email.',
      requiresEmailVerification: true,
    };
  }

  const newRefreshToken = jwtHelpers.generateToken(
    {
      id: userData.id,
      email: userData.email as string,
      role: userData.role,
    },
    config.jwt.refresh_secret as string,
    config.jwt.refresh_expires_in as string
  );
  const accessToken = jwtHelpers.generateToken(
    {
      id: userData.id,
      email: userData.email as string,
      role: userData.role,
    },
    config.jwt.access_secret as Secret,
    config.jwt.access_expires_in as string
  );

  // Return user details and access token
  return {
    id: userData.id,
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    role: userData.role,
    image: userData.image,
    status: userData.status,
    isVerified: userData.isVerified,
    accessToken: accessToken,
    refreshToken: newRefreshToken,
  };
};
const UserDeleteFromDB = async (email: string) => {
  //find user
  const userData = await prisma.user.findUnique({
    where: {
      email,
    },
  });
  if (!userData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (userData.status === UserStatus.BLOCKED) {
    throw new ApiError(httpStatus.FORBIDDEN, 'This user is not active!');
  }
  if (userData.isDeleted) {
    throw new ApiError(httpStatus.FORBIDDEN, 'This user already deleted!');
  }

  //account soft delete
  const userDelete = await prisma.user.update({
    where: {
      email: userData.email,
    },
    data: {
      isDeleted: true,
    },
  });
  return userDelete;
};
const adminLoginUserFromDB = async (payload: IUserLogin) => {
  const userData = await prisma.user.findUnique({
    where: {
      email: payload.email,
      OR: [{ role: Role.ADMIN }, { role: Role.SUPERADMIN }],
    },
  });
  if (!userData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const isCorrectPassword = await bcrypt.compare(payload.password, userData.password as string);

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password incorrect');
  }

  const accessToken = jwtHelpers.generateToken(
    {
      id: userData.id,
      email: userData.email as string,
      role: userData.role,
    },
    config.jwt.access_secret as Secret,
    config.jwt.access_expires_in as string
  );

  // Return user details and access token
  return {
    id: userData.id,
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    role: userData.role,
    image: userData.image,
    status: userData.status,
    isVerified: userData.isVerified,
    accessToken: accessToken,
  };
};

const resetPassword = async (userId: string, newPassword: string) => {
  const hashedPassword: string = await bcrypt.hash(newPassword, Number(config.bcrypt_salt_rounds));

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      password: hashedPassword,
    },
  });

  return {
    message: 'please login',
  };
};

const changePassword = async (userId: string, payload: IChangePassword) => {
  const userData = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      password: true,
      email: true,
      id: true,
      status: true,
    },
  });

  if (!userData) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'User not found!, If you have already have account please reset your password'
    );
  }

  // Check if the user status is BLOCKED
  if (userData.status === UserStatus.BLOCKED) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been blocked. Please contact support.');
  }

  // Check if the password is correct
  const isCorrectPassword = await bcrypt.compare(payload.oldPassword, userData.password as string);

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Credentials not matched');
  }
  // Hash the user's password

  const salt = bcrypt.genSaltSync(Number(config.bcrypt_salt_rounds) || 12); // Generate a random salt

  const hashedPassword: string = await bcrypt.hash(payload.newPassword, Number(config.bcrypt_salt_rounds));

  // Update the user's password in the database template
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
    },
  });
  if (!updatedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found in the database.');
  }
  return {
    message: 'password updated successfully',
  };
};

const refreshToken = async (token: string) => {
  const decoded = verifyToken(token, config.jwt.refresh_secret as string) as RefreshPayload;

  const { email, iat } = decoded;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      image: true,
      isVerified: true,
      passwordChangedAt: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  /* Reject if password changed after token was issued */
  if (
    user.passwordChangedAt &&
    /* convert both to seconds since epoch */
    Math.floor(user.passwordChangedAt.getTime() / 1000) > iat
  ) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password was changed after this token was issued');
  }
  const jwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  // ✅ FIX: Use ACCESS token config, not REFRESH token config
  const accessToken = jwtHelpers.generateToken(
    jwtPayload,
    config.jwt.access_secret as string,
    config.jwt.access_expires_in as string
  );
  // ✅ GENERATE NEW REFRESH TOKEN to extend session
  const newRefreshToken = jwtHelpers.generateToken(
    jwtPayload,
    config.jwt.refresh_secret as string,
    config.jwt.refresh_expires_in as string
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
};

export const AuthServices = {
  createAccount,
  loginUserFromDB,
  verifyEmail,
  forgotPassword,
  verifyOtp,
  resetPassword,
  changePassword,
  adminLoginUserFromDB,
  resendOtp,
  UserDeleteFromDB,
  refreshToken,
  googleLogin,
};
