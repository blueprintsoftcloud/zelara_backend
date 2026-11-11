import { Router } from "express";
import {
  saveLocationAndGetShipping,
  saveManualAddress,
  getDefaultAddress,
  previewShipping,
} from "../controllers/address.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { addressSchema } from "../schemas/address.schema";

const router = Router();

router.post("/save-geo", authMiddleware, saveLocationAndGetShipping);
router.post("/save-manual", authMiddleware, validate(addressSchema), saveManualAddress);
router.get("/default", authMiddleware, getDefaultAddress);
router.post("/preview-shipping", authMiddleware, previewShipping);

export default router;
