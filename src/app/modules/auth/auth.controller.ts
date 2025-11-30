import httpStatus from 'http-status';
import sendResponse from '../../helpers/sendResponse';
import { AuthServices } from './auth.service';
import { Request, Response } from 'express';
import catchAsync from '../../helpers/catchAsync';
import ApiError from '../../errors/ApiError';

const createAccount = catchAsync(async (req, res) => {
  const result = await AuthServices.createAccount(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: 'Registered Successfully!',
    data: result,
  });
});

const verifiedEmail = catchAsync(async (req, res) => {
  const { userId, otpCode, type } = req.body;

  const result: any = await AuthServices.verifyEmail(userId, { otpCode, type });

  res.cookie('refreshToken', result?.refreshToken, {
    httpOnly: true,
    secure: false, // config.NODE_ENV === "production"
    sameSite: 'lax', // config.NODE_ENV === "production" ? true : "lax",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 30 days (matches JWT refresh token expiry)
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'OTP verified successfully',
    data: result,
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.loginUserFromDB(req.body);
  // ✅ SET NEW REFRESH TOKEN as HTTP-only cookie
  res.cookie('refreshToken', result?.refreshToken, {
    httpOnly: true,
    secure: false, // config.NODE_ENV === "production"
    sameSite: 'lax', // config.NODE_ENV === "production" ? true : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (matches JWT refresh token expiry)
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User logged in successfully',
    data: result,
  });
});

const googleLogin = catchAsync(async (req, res) => {
  const { token } = req.body;

  const result = await AuthServices.googleLogin(token, req);

  const { accessToken, refreshToken } = result;

  // ✅ SET BOTH TOKENS as HTTP-only cookies for Google login
  res.cookie('refreshToken', result?.refreshToken, {
    httpOnly: true,
    secure: false, // config.NODE_ENV === "production"
    sameSite: 'lax', // config.NODE_ENV === "production" ? true : "lax",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 30 days (matches JWT refresh token expiry)
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User logged in with Google successfully!',
    data: {
      accessToken,
      refreshToken,
    },
  });
});
const userDeleteFromDB = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;

  const result = await AuthServices.UserDeleteFromDB(email);

  if (result) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Your account delete successfull!',
      data: result,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User delete successfully',
    data: result,
  });
});
const adminLoginUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.adminLoginUserFromDB(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User logged in successfully',
    data: result,
  });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.forgotPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'An secret number has been send',
    data: result,
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const result: any = await AuthServices.verifyOtp(req.body);
  if (result.statusCode) {
    const { statusCode, message, ...data } = result;
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      message,
      data: data,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'OTP verified successfully please reset your password',
    data: result,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const newPassword = req.body.newPassword;
  const result = await AuthServices.resetPassword(userId, newPassword);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Password Reset successfully please login',
    data: result,
  });
});
const changePassword = catchAsync(async (req, res) => {
  const userId: string = req.user.id;
  const oldPassword: string = req.body.oldPassword;
  const newPassword: string = req.body.newPassword;
  const result = await AuthServices.changePassword(userId, {
    newPassword,
    oldPassword,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'password changed successfully',
    data: result,
  });
});
const resendOtp = catchAsync(async (req, res) => {
  const userId = req.body.userId;

  const result: any = await AuthServices.resendOtp(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'OTP resent successfully to your email',
    data: result,
  });
});
const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token not found in cookies');
  }

  const result = await AuthServices.refreshToken(refreshToken);
  const { accessToken, refreshToken: newRefreshToken } = result;

  // ✅ SET NEW REFRESH TOKEN as HTTP-only cookie
  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: false, // config.NODE_ENV === "production"
    sameSite: 'lax', // config.NODE_ENV === "production" ? true : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (matches JWT refresh token expiry)
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Access token is retrieved successfully!',
    data: { accessToken },
  });
});






export const AuthControllers = {
  createAccount,
  loginUser,
  forgotPassword,
  resetPassword,
  changePassword,
  verifiedEmail,
  adminLoginUser,
  resendOtp,
  userDeleteFromDB,
  verifyOtp,
  refreshToken,
  googleLogin,
  
};
