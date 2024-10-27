'use strict';

const { Contract } = require('fabric-contract-api');
const OrderContract = require('./order-contract'); // Link to OrderContract for order management

class ProductContract extends Contract {

    // Check if a product exists
    async productExists(ctx, productId) {
        const buffer = await ctx.stub.getState(productId);
        return (!!buffer && buffer.length > 0);
    }

    // Manufacturer creates a product
    async createProduct(ctx, productId, type, quantity, harvestDate, origin, producerName) {
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID === 'manufacturerMSP') {
            const exists = await this.productExists(ctx, productId);
            if (exists) {
                throw new Error(`The product ${productId} already exists`);
            }
            const product = {
                type,
                quantity,
                harvestDate,
                origin,
                status: 'Harvested',
                ownedBy: producerName,
                assetType: 'product'
            };
            const buffer = Buffer.from(JSON.stringify(product));
            await ctx.stub.putState(productId, buffer);

            const productEvent = { Type: 'Product creation', ProductType: type };
            await ctx.stub.setEvent('addProductEvent', Buffer.from(JSON.stringify(productEvent)));
        } else {
            return `User under the following MSP: ${mspID} cannot perform this action`;
        }
    }

    // Read product details by productId
    async readProduct(ctx, productId) {
        const exists = await this.productExists(ctx, productId);
        if (!exists) {
            throw new Error(`The product ${productId} does not exist`);
        }
        const buffer = await ctx.stub.getState(productId);
        return JSON.parse(buffer.toString());
    }

    // Manufacturer deletes a product
    async deleteProduct(ctx, productId) {
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID === 'manufacturerMSP') {
            const exists = await this.productExists(ctx, productId);
            if (!exists) {
                throw new Error(`The product ${productId} does not exist`);
            }
            await ctx.stub.deleteState(productId);
        } else {
            return `User under the following MSP: ${mspID} cannot perform this action`;
        }
    }

    // manufacturer updates the product status to "Transferred to Wholesaler"
    async transferToWholesaler(ctx, productId, wholesalerName) {
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID === 'manufacturerMSP') {
            const exists = await this.productExists(ctx, productId);
            if (!exists) {
                throw new Error(`The product ${productId} does not exist`);
            }
            const buffer = await ctx.stub.getState(productId);
            const product = JSON.parse(buffer.toString());
            product.status = 'Transferred to Wholesaler';
            product.ownedBy = wholesalerName;

            const updatedProductBuffer = Buffer.from(JSON.stringify(product));
            await ctx.stub.putState(productId, updatedProductBuffer);
        } else {
            return `User under the following MSP: ${mspID} cannot perform this action`;
        }
    }

    // Distributor creates an order, then matches it with available products
    async matchOrder(ctx, productId, orderId) {
        const orderContract = new OrderContract();

        const productExists = await this.productExists(ctx, productId);
        if (!productExists) {
            throw new Error(`The product ${productId} does not exist`);
        }

        const orderExists = await orderContract.orderExists(ctx, orderId);
        if (!orderExists) {
            throw new Error(`The order ${orderId} does not exist`);
        }

        const productDetails = await this.readProduct(ctx, productId);
        const orderDetails = await orderContract.readOrder(ctx, orderId);

        // Matching criteria based on product type and quantity
        if (orderDetails.type === productDetails.type && orderDetails.quantity <= productDetails.quantity) {
            productDetails.ownedBy = orderDetails.distributerName;
            productDetails.status = 'Assigned to Order';

            const updatedProductBuffer = Buffer.from(JSON.stringify(productDetails));
            await ctx.stub.putState(productId, updatedProductBuffer);

            await orderContract.deleteOrder(ctx, orderId); // Delete the matched order from OrderContract
            return `Product ${productId} is assigned to ${orderDetails.distributerName}`;
        } else {
            return 'Order does not match the product specifications';
        }
    }

    async assignProductToMarket(ctx, productId, ownerName, marketName) {
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID === 'distributerMSP') {
            const exists = await this.productExists(ctx, productId);
            if (!exists) {
                throw new Error(`The product ${productId} does not exist`);
            }

            const productBuffer = await ctx.stub.getState(productId);
            const productDetails = JSON.parse(productBuffer.toString());

            productDetails.status = `Assigned to ${ownerName} for the market ${marketName}`;
            productDetails.ownedBy = ownerName;

            const newProductBuffer = Buffer.from(JSON.stringify(productDetails));
            await ctx.stub.putState(productId, newProductBuffer);

            return `Product ${productId} is successfully assigned to ${ownerName}`;
        } else {
            return `User under following MSP:${mspID} cannot able to perform this action`;
        }
    }

    // Query all products of assetType "product"
    async queryAllProducts(ctx) {
        const queryString = { selector: { assetType: 'product' } };
        const resultIterator = await ctx.stub.getQueryResult(JSON.stringify(queryString));
        const results = await this._getAllResults(resultIterator);
        return JSON.stringify(results);
    }

    // Private helper function to retrieve all results
    async _getAllResults(iterator) {
        const allResults = [];
        let res = await iterator.next();
        while (!res.done) {
            if (res.value && res.value.value.toString()) {
                let jsonRes = {};
                jsonRes.Key = res.value.key;
                jsonRes.Record = JSON.parse(res.value.value.toString());
                allResults.push(jsonRes);
            }
            res = await iterator.next();
        }
        await iterator.close();
        return allResults;
    }

    // Get product history by productId
    async getProductHistory(ctx, productId) {
        const resultIterator = await ctx.stub.getHistoryForKey(productId);
        const results = await this._getAllResults(resultIterator, true);
        return JSON.stringify(results);
    }

    // Paginated query for large datasets
    async getProductsWithPagination(ctx, pageSize, bookmark) {
        const queryString = { selector: { assetType: 'product' } };
        const pageSizeInt = parseInt(pageSize, 10);
        const { iterator, metadata } = await ctx.stub.getQueryResultWithPagination(JSON.stringify(queryString), pageSizeInt, bookmark);
        const results = await this._getAllResults(iterator, false);

        return JSON.stringify({
            Result: results,
            ResponseMetaData: {
                RecordCount: metadata.fetchedRecordsCount,
                Bookmark: metadata.bookmark
            }
        });
    }
}

module.exports = ProductContract;
