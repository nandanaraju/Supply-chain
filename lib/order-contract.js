'use strict';

const { Contract } = require('fabric-contract-api');

async function getCollectionName(ctx) {
    const collectionName = 'OrderCollection';
    return collectionName;
}

class OrderContract extends Contract {

    async orderExists(ctx, orderId) {
        const collectionName = await getCollectionName(ctx);
        const data = await ctx.stub.getPrivateDataHash(collectionName, orderId);
        return (!!data && data.length > 0);
    }

    async createOrder(ctx, orderId) {
        const mspid = ctx.clientIdentity.getMSPID();
        if (mspid === 'distributerMSP') {
            const exists = await this.orderExists(ctx, orderId);
            if (exists) {
                throw new Error(`The order ${orderId} already exists`);
            }

            const OrderAsset = {};
            const transientData = ctx.stub.getTransient();

            if (!transientData.has('type') || !transientData.has('quantity') || !transientData.has('price') || !transientData.has('distributerName')) {
                throw new Error('Required fields are missing in transient data');
            }

            // Set the order parameters based on transient data
            OrderAsset.type = transientData.get('type').toString();
            OrderAsset.quantity = parseInt(transientData.get('quantity').toString());
            OrderAsset.price = parseFloat(transientData.get('price').toString());
            OrderAsset.distributerName = transientData.get('distributerName').toString();
            OrderAsset.assetType = 'order';

            const collectionName = await getCollectionName(ctx);
            await ctx.stub.putPrivateData(collectionName, orderId, Buffer.from(JSON.stringify(OrderAsset)));
        } else {
            return `Organization with MSP ID ${mspid} cannot perform this action`;
        }
    }

    async readOrder(ctx, orderId) {
        const exists = await this.orderExists(ctx, orderId);
        if (!exists) {
            throw new Error(`The order ${orderId} does not exist`);
        }

        const collectionName = await getCollectionName(ctx);
        const privateData = await ctx.stub.getPrivateData(collectionName, orderId);
        return JSON.parse(privateData.toString());
    }

    async deleteOrder(ctx, orderId) {
        const mspid = ctx.clientIdentity.getMSPID();
        if (mspid === 'distributerMSP') {
            const exists = await this.orderExists(ctx, orderId);
            if (!exists) {
                throw new Error(`The order ${orderId} does not exist`);
            }
            const collectionName = await getCollectionName(ctx);
            await ctx.stub.deletePrivateData(collectionName, orderId);
        } else {
            return `Organization with MSP ID ${mspid} cannot perform this action`;
        }
    }

    async queryAllOrders(ctx) {
        const queryString = { selector: { assetType: 'order' } };
        const collectionName = await getCollectionName(ctx);
        const resultIterator = await ctx.stub.getPrivateDataQueryResult(collectionName, JSON.stringify(queryString));
        const results = await this._getAllResults(resultIterator);
        return JSON.stringify(results);
    }

    async getOrdersByRange(ctx, startKey, endKey) {
        const collectionName = await getCollectionName(ctx);
        const resultIterator = await ctx.stub.getPrivateDataByRange(collectionName, startKey, endKey);
        const results = await this._getAllResults(resultIterator);
        return JSON.stringify(results);
    }

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
}

module.exports = OrderContract;
