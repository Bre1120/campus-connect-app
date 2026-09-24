import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import coursesRouter from "./courses";
import dashboardRouter from "./dashboard";
import profileRouter from "./profile";
import flashcardsRouter from "./flashcards";
import studyAssistantRouter from "./study-assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(coursesRouter);
router.use(dashboardRouter);
router.use(profileRouter);
router.use(flashcardsRouter);
router.use(studyAssistantRouter);

export default router;
