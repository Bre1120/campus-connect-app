import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import coursesRouter from "./courses";
import dashboardRouter from "./dashboard";
import profileRouter from "./profile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(coursesRouter);
router.use(dashboardRouter);
router.use(profileRouter);

export default router;
