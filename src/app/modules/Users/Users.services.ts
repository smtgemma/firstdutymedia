import httpStatus from 'http-status';
import fs from 'fs';
import prisma from '../../lib/prisma';
import path from 'path';
import { Role, User, UserStatus } from '@prisma/client';
import type { IPaginationOptions } from '../../interface/pagination.type';
import { paginationHelper } from '../../helpers/paginationHelper';
import ApiError from '../../errors/ApiError';

import { QuickStatusResponse } from './Users.subscription.interface';

const getMyProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  return user;
};

const getSingleProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      image: true,
      role: true,
      status: true,
      email: true,
      createdAt: true,
      accountWith: true,

      isVerified: true,
      isEmailVerified: true,
    },
  });
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'user not found');
  await prisma.user.update({
    where: { id: userId },
    data: {
      profileView: {
        increment: 1,
      },
    },
  });
  return user;
};

// Enhanced Dealer Profile with comprehensive information
const getDealerProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
      role: Role.USER, // Ensure it's a user
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      image: true,
      role: true,
      isVerified: true,
      isEmailVerified: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Dealer not found');
  }

  return {
    // Basic user info
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    image: user.image,
    role: user.role,
    isVerified: user.isVerified,
  };
};

const getAllBlockedUsers = async (options: IPaginationOptions) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  //  const { search } = options;

  const users = await prisma.user.findMany({
    where: {
      status: UserStatus.BLOCKED,
      NOT: {
        role: Role.SUPERADMIN,
      },
    },
    skip,
    take: limit,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  const total = await prisma.user.count({
    where: {
      NOT: {
        role: Role.SUPERADMIN,
      },
    },
  });
  const totalPages = Math.ceil(total / limit); // Calculate total pages

  return {
    meta: {
      total,
      page,
      totalPage: Math.ceil(total / limit),
      limit,
    },
    data: users,
  };
};

const updateMyProfile = async (userId: string, payload: any) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const data = await prisma.user.update({
    where: { id: userId },
    data: payload,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      image: true,
      role: true,
    },
  });

  return data;
};

const updateMyProfileImage = async (userId: string, payload: any, file: any) => {
  // Fetch the existing user with their current image
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });

  // If the user doesn't exist, throw a 404 error
  if (!existingUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  // Generate the new image URL if a file is provided
  const imageURL =
    file && file.originalname ? `${payload.protocol}://${payload.host}/uploads/${file.filename}` : existingUser.image; // Keep existing image if no new file is uploaded

  // Update the user's profile with the new image URL
  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      image: imageURL,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      image: true,
    },
  });

  // If the user had an existing image, delete it from the file system
  if (existingUser.image) {
    // Extract the file name from the URL
    const imageFileName = existingUser.image.split('/').pop();

    // Resolve the file path
    const existingImagePath = path.resolve('uploads', imageFileName || '');

    // Check if the file exists before trying to delete it
    fs.exists(existingImagePath, (exists) => {
      if (exists) {
        // Delete the existing image if it exists
        fs.unlink(existingImagePath, (err) => {
          if (err) {
            console.error('Error deleting existing image:', err);
          } else {
          }
        });
      } else {
        console.error(`File not found: ${existingImagePath}`);
      }
    });
  }

  // Return the updated user data
  return updatedUser;
};

const updateUserStatus = async (userId: string, payload: { status: any }) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true },
  });
  if (!existingUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      status: payload.status.toUpperCase(),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });



  return updatedUser;
};

const updateUserRole = async (userId: string, payload: { role: Role }) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true },
  });
  if (!existingUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      role: payload.role as Role,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });



  return updatedUser;
};

// Get user profile stats for profile page
const getUserProfileStats = async (userId: string) => {
  try {
    // Get user basic info with subscription and academy data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        image: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      image: user.image || undefined,
      role: user.role,
      status: user.status,
    };
  } catch (error) {
    console.error('Error fetching user profile stats:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch user profile stats');
  }
};

export const UsersService = {
  getMyProfile,

  updateMyProfile,
  updateMyProfileImage,
  updateUserStatus,
  getSingleProfile,
  getAllBlockedUsers,
  updateUserRole,
  getDealerProfile,
  // New profile page functions
  getUserProfileStats,
};
