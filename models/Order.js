import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: Number,
        price: Number,
      },
    ],

    address: {
      fullName: String,
      phone: String,
      addressLine: String,
      city: String,
      state: String,
      pincode: String,
    },

    totalAmount: Number,

    paymentMethod: {
      type: String,
      default: "COD",
    },
    paymentStatus: {
      type: String,
      default: "Pending",
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    cancelledBy: String,
    cancelReason: String,
    cancelledAt: Date,
    stockRestored: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      default: "Placed",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
