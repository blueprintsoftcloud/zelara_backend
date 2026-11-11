import { Router } from "express";
import {
  cartAdd,
  cartList,
  cartRemove,
  cartClear,
  updateProductQuantity,
} from "../controllers/cart.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { cartAddSchema, cartUpdateQuantitySchema } from "../schemas/cart.schema";

const router = Router();

router.post("/add", authMiddleware, validate(cartAddSchema), cartAdd);
router.get("/list", authMiddleware, cartList);
router.delete("/remove/:productId", authMiddleware, cartRemove);
router.delete("/clear", authMiddleware, cartClear);
router.put("/updateQuantity/:productId", authMiddleware, validate(cartUpdateQuantitySchema), updateProductQuantity);

export default router;
