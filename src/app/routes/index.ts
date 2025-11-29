import express from 'express';

import { AuthRouters } from '../modules/auth/auth.routes';
import { UsersRoutes } from '../modules/Users/Users.route';


const router = express.Router();

const moduleRoutes = [
  {
    path: '/auth',
    route: AuthRouters,
  },
  {
    path: '/users',
    route: UsersRoutes,
  },


];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
