import Product from "../models/product.js";

// Create a new product
export const createProduct = async (req, res) => {
    try{
        const files = req.files || [];
        if (files.length < 4) {
            return res.status(400).json({ message: "Please upload at least 4 images." });
        }

        const { title, description, category } = req.body;
        const sku = (req.body.sku || "").trim().toUpperCase();
        const price = Number(req.body.price);
        const stock = Number(req.body.stock);

        if (!title || Number.isNaN(price)) {
            return res.status(400).json({ message: "Title and valid price are required." });
        }
        if (!sku) {
            return res.status(400).json({ message: "SKU is required." });
        }
        if (!Number.isFinite(stock)) {
            return res.status(400).json({ message: "Stock must be a valid number." });
        }

        const imageUrls = files.map((file) => `${req.protocol}://${req.get("host")}/uploads/products/${file.filename}`);
        const payload = {
            title,
            description,
            price,
            category,
            sku,
            stock,
            images: imageUrls,
            image: imageUrls[0]
        };

        const product = await Product.create(payload);
        res.json({
            message: 'Product created successfully',
            product,
        })
    } catch (error) {
        if (error?.code === 11000 && error?.keyPattern?.sku) {
            return res.status(400).json({ message: "SKU already exists. Please use a unique SKU." });
        }
        console.error("createProduct error:", error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

// Get all products
export const getProducts = async (req, res) => {
    try {
        const {search, category} = req.query;

        let filter = {};
        const escapedCategory = String(category || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedSearch = String(search || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        if (escapedSearch) {
            filter.$or = [
                { title: { $regex: escapedSearch, $options: "i" } },
                { description: { $regex: escapedSearch, $options: "i" } },
                { sku: { $regex: escapedSearch, $options: "i" } },
            ];
        }

        if (escapedCategory) {
            filter.category = { $regex: `^${escapedCategory}$`, $options: "i" };
        }

        const products = await Product.find(filter).sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        console.error("getProducts error:", error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
};

//Update a product
export const updateProduct = async (req, res) => {
    try {
        const files = req.files || [];
        const payload = {
            ...req.body,
        };

        if (payload.sku !== undefined) {
            const normalizedSku = String(payload.sku).trim().toUpperCase();
            if (!normalizedSku) {
                return res.status(400).json({ message: "SKU cannot be empty." });
            }
            payload.sku = normalizedSku;
        }

        if (payload.price !== undefined) {
            payload.price = Number(payload.price);
            if (Number.isNaN(payload.price)) {
                return res.status(400).json({ message: "Price must be a valid number." });
            }
        }

        if (payload.stock !== undefined) {
            payload.stock = Number(payload.stock);
            if (!Number.isFinite(payload.stock)) {
                return res.status(400).json({ message: "Stock must be a valid number." });
            }
        }

        if (files.length > 0) {
            if (files.length < 4) {
                return res.status(400).json({ message: "When uploading new images, please upload at least 4 images." });
            }

            const imageUrls = files.map((file) => `${req.protocol}://${req.get("host")}/uploads/products/${file.filename}`);
            payload.images = imageUrls;
            payload.image = imageUrls[0];
        }

        const updated = await Product.findByIdAndUpdate(
            req.params.id,
            payload,
            { new: true }
        );
        res.json({
            message: 'Product updated successfully',
            updated,
        });
    } catch (error) {
        if (error?.code === 11000 && error?.keyPattern?.sku) {
            return res.status(400).json({ message: "SKU already exists. Please use a unique SKU." });
        }
        console.error("updateProduct error:", error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
}

// Delete a product
export const deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error("deleteProduct error:", error);
        res.status(500).json({ message: error.message || 'Server Error' });
    }
}
