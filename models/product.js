import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: String,
    price: {
      type: Number,
      required: true,
    },
    category: String,
    sku: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    images: {
      type: [String],
      default: [],
    },
    image: String,
    stock: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// ✅ SAFE MODEL EXPORT (PREVENTS OverwriteModelError IN DEV/HOT-RELOAD)
const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
export default Product;
