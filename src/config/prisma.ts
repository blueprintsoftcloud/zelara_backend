import mongoose, { ClientSession, Types } from 'mongoose';
import {
  Address,
  AppSetting,
  AuditLog,
  Cart,
  CartItem,
  Category,
  CategoryAttribute,
  CategoryAttributeValue,
  CompanySettings,
  Coupon,
  CustomerTracker,
  DeliveryPartner,
  HomeBanner,
  Notification,
  Otp,
  Order,
  OrderItem,
  PaymentLog,
  Product,
  ProductAttributeValue,
  ProductVariant,
  Review,
  StaffProfile,
  TempUpdate,
  User,
  Wishlist,
  Attribute,
  AttributeValue,
  PasswordReset,
} from '../models/mongoose';

const MODEL_MAP: Record<string, any> = {
  user: User,
  address: Address,
  category: Category,
  product: Product,
  categoryattribute: CategoryAttribute,
  categoryattributevalue: CategoryAttributeValue,
  productattributevalue: ProductAttributeValue,
  productvariant: ProductVariant,
  cart: Cart,
  cartitem: CartItem,
  order: Order,
  orderitem: OrderItem,
  wishlist: Wishlist,
  review: Review,
  notification: Notification,
  otp: Otp,
  tempupdate: TempUpdate,
  coupon: Coupon,
  staffprofile: StaffProfile,
  auditlog: AuditLog,
  appsetting: AppSetting,
  paymentlog: PaymentLog,
  homebanner: HomeBanner,
  customertracker: CustomerTracker,
  attribute: Attribute,
  attributevalue: AttributeValue,
  companysettings: CompanySettings,
  passwordreset: PasswordReset,
  deliverypartner: DeliveryPartner,
};

const RELATION_MAP: Record<string, Record<string, { localField: string; foreignModel: string; foreignField: string; isArray?: boolean }>> = {
  cartitem: {
    cart: { localField: 'cartId', foreignModel: 'cart', foreignField: '_id' },
    product: { localField: 'productId', foreignModel: 'product', foreignField: '_id' },
    variant: { localField: 'variantId', foreignModel: 'productvariant', foreignField: '_id' },
  },
  orderitem: {
    order: { localField: 'orderId', foreignModel: 'order', foreignField: '_id' },
    product: { localField: 'productId', foreignModel: 'product', foreignField: '_id' },
    variant: { localField: 'variantId', foreignModel: 'productvariant', foreignField: '_id' },
  },
  productvariant: {
    product: { localField: 'productId', foreignModel: 'product', foreignField: '_id' },
  },
  order: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
    coupon: { localField: 'couponId', foreignModel: 'coupon', foreignField: '_id' },
    placedByAdmin: { localField: 'placedByAdminId', foreignModel: 'user', foreignField: '_id' },
    items: { localField: '_id', foreignModel: 'orderitem', foreignField: 'orderId', isArray: true },
  },
  cart: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
    items: { localField: '_id', foreignModel: 'cartitem', foreignField: 'cartId', isArray: true },
  },
  wishlist: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
    product: { localField: 'productId', foreignModel: 'product', foreignField: '_id' },
    variant: { localField: 'variantId', foreignModel: 'productvariant', foreignField: '_id' },
  },
  review: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
    product: { localField: 'productId', foreignModel: 'product', foreignField: '_id' },
    variant: { localField: 'variantId', foreignModel: 'productvariant', foreignField: '_id' },
  },
  paymentlog: {
    order: { localField: 'orderId', foreignModel: 'order', foreignField: '_id' },
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
  },
  address: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
  },
  staffprofile: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
    managedBy: { localField: 'managedBy', foreignModel: 'user', foreignField: '_id' },
  },
  product: {
    category: { localField: 'categoryId', foreignModel: 'category', foreignField: '_id' },
    // Was missing entirely, same gap as categoryattribute.values below — every
    // `include: { attributeValues: ... }` in product.controller.ts / product-user
    // .controller.ts silently no-opped, so a saved product's attribute values never
    // came back in any API response even once createMany (see below) actually wrote them.
    attributeValues: { localField: '_id', foreignModel: 'productattributevalue', foreignField: 'productId', isArray: true },
  },
  categoryattribute: {
    category: { localField: 'categoryId', foreignModel: 'category', foreignField: '_id' },
    // Was missing entirely — every `include: { values: ... }` in attribute.controller.ts
    // silently no-opped (attachRelations skips unknown relation keys), so `attr.values`
    // was always undefined on every returned attribute, crashing any code (e.g.
    // CategoryAttributes.tsx) that assumed it was at least an empty array.
    values: { localField: '_id', foreignModel: 'categoryattributevalue', foreignField: 'attributeId', isArray: true },
  },
  categoryattributevalue: {
    attribute: { localField: 'attributeId', foreignModel: 'categoryattribute', foreignField: '_id' },
  },
  productattributevalue: {
    product: { localField: 'productId', foreignModel: 'product', foreignField: '_id' },
    attribute: { localField: 'attributeId', foreignModel: 'categoryattribute', foreignField: '_id' },
    attributeValue: { localField: 'attributeValueId', foreignModel: 'categoryattributevalue', foreignField: '_id' },
    variant: { localField: 'variantId', foreignModel: 'productvariant', foreignField: '_id' },
  },
  tempupdate: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
  },
  auditlog: {
    user: { localField: 'userId', foreignModel: 'user', foreignField: '_id' },
  },
  notification: {
    triggeredBy: { localField: 'triggeredById', foreignModel: 'user', foreignField: '_id' },
    recipient: { localField: 'recipientId', foreignModel: 'user', foreignField: '_id' },
    order: { localField: 'orderId', foreignModel: 'order', foreignField: '_id' },
  },
};

const PRISMA_OPERATORS = new Set([
  'equals',
  'in',
  'notIn',
  'lt',
  'lte',
  'gt',
  'gte',
  'contains',
  'startsWith',
  'endsWith',
  'has',
  'hasEvery',
  'hasSome',
  'not',
  'mode',
]);

const OPERATOR_MAP: Record<string, string> = {
  in: '$in',
  notIn: '$nin',
  lt: '$lt',
  lte: '$lte',
  gt: '$gt',
  gte: '$gte',
  hasEvery: '$all',
  hasSome: '$in',
};

const isObject = (value: any): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof RegExp);

const isObjectIdLike = (value: any) =>
  value instanceof Types.ObjectId || value?._bsontype === 'ObjectId';

const convertFieldName = (field: string) => (field === 'id' ? '_id' : field);

const convertValue = (field: string, value: any) => {
  if (field === 'id' || field.endsWith('Id')) {
    if (Array.isArray(value)) {
      return value.map((v) => (Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : v));
    }
    return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
  }
  return value;
};

const isPrismaOperatorObject = (value: any) =>
  isObject(value) && Object.keys(value).every((key) => PRISMA_OPERATORS.has(key));

const convertPrismaOperator = (field: string, value: any): any => {
  if (!isObject(value)) {
    return convertValue(field, value);
  }

  const result: any = {};
  for (const [operator, operand] of Object.entries(value)) {
    if (operator === 'equals') {
      return convertValue(field, operand);
    }
    if (operator === 'not') {
      const inner = convertPrismaOperator(field, operand);
      // MongoDB $not requires a regex or operator expression, not a plain scalar / ObjectId.
      // For scalar comparisons use $ne instead.
      if (!isObject(inner) || isObjectIdLike(inner)) {
        result.$ne = inner;
      } else {
        result.$not = inner;
      }
      continue;
    }
    if (operator === 'mode') {
      // 'mode: insensitive' is already handled by the 'i' flag in contains/startsWith/endsWith
      continue;
    }
    if (operator === 'contains') {
      result.$regex = new RegExp(operand, 'i');
      continue;
    }
    if (operator === 'startsWith') {
      result.$regex = new RegExp(`^${operand}`, 'i');
      continue;
    }
    if (operator === 'endsWith') {
      result.$regex = new RegExp(`${operand}$`, 'i');
      continue;
    }
    if (operator === 'has') {
      return operand;
    }
    const mongoOp = OPERATOR_MAP[operator];
    if (mongoOp) {
      result[mongoOp] = Array.isArray(operand)
        ? operand.map((v) => convertValue(field, v))
        : convertValue(field, operand);
      continue;
    }
    result[operator] = convertValue(field, operand);
  }
  return result;
};

const resolveRelationFilter = async (
  modelName: string,
  relationName: string,
  relationFilter: any,
  session?: ClientSession,
) => {
  const relation = RELATION_MAP[modelName]?.[relationName];
  if (!relation) {
    return [];
  }

  const foreignModel = MODEL_MAP[relation.foreignModel];
  if (!foreignModel) {
    return [];
  }

  const query = await translateWhere(relationFilter, relation.foreignModel);
  const docs = await foreignModel.find(query, { _id: 1 }).session(session ?? null).exec();
  return docs.map((doc: any) => doc._id);
};

const translateWhere = async (where: any, modelName: string, session?: ClientSession): Promise<any> => {
  if (!where || typeof where !== 'object') {
    return {};
  }

  const result: any = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      const clauses = Array.isArray(value) ? value : [value];
      const converted = await Promise.all(clauses.map((clause) => translateWhere(clause, modelName, session)));
      if (key === 'AND') result.$and = converted;
      if (key === 'OR') result.$or = converted;
      if (key === 'NOT') result.$nor = converted;
      continue;
    }

    const relation = RELATION_MAP[modelName]?.[key];
    const fieldName = convertFieldName(key);

    if (relation && isObject(value) && !isPrismaOperatorObject(value)) {
      const ids = await resolveRelationFilter(modelName, key, value, session);
      result[relation.localField] = ids.length > 0 ? { $in: ids } : { $in: [] };
      continue;
    }

    if ((key === 'id' || key === '_id') && isPrismaOperatorObject(value)) {
      const stringOp = Object.keys(value as object).find((k) => ['contains', 'startsWith', 'endsWith'].includes(k));
      if (stringOp) {
        const raw = String((value as any)[stringOp] ?? '');
        const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = stringOp === 'startsWith' ? `^${escaped}` : stringOp === 'endsWith' ? `${escaped}$` : escaped;
        result.$expr = {
          $regexMatch: {
            input: { $toString: '$_id' },
            regex: pattern,
            options: 'i',
          },
        };
        continue;
      }
    }

    if (isPrismaOperatorObject(value)) {
      result[fieldName] = convertPrismaOperator(key, value);
      continue;
    }

    if (isObject(value)) {
      result[fieldName] = await translateWhere(value, modelName, session);
      continue;
    }

    result[fieldName] = convertValue(key, value);
  }

  return result;
};

const normalizeInclude = (modelName: string, args: any) => {
  const include: any = {};
  if (args?.include && typeof args.include === 'object') {
    Object.assign(include, args.include);
  }
  if (args?.select && typeof args.select === 'object') {
    for (const [key, value] of Object.entries(args.select)) {
      if (isObject(value) && RELATION_MAP[modelName]?.[key]) {
        include[key] = value;
      }
    }
  }
  return include;
};

const buildProjection = (modelName: string, select: any) => {
  if (!select || typeof select !== 'object') return '';
  const fields: string[] = [];
  for (const [key, value] of Object.entries(select)) {
    if (value === true && !RELATION_MAP[modelName]?.[key]) {
      fields.push(convertFieldName(key));
    } else if (RELATION_MAP[modelName]?.[key]) {
      const relation = RELATION_MAP[modelName][key];
      if (!relation.isArray && relation.localField) {
        fields.push(convertFieldName(relation.localField));
      }
    }
  }
  return fields.join(' ');
};

const buildSort = (orderBy: any) => {
  if (!orderBy || typeof orderBy !== 'object') return {};
  const sort: any = {};
  for (const [key, value] of Object.entries(orderBy)) {
    if (key === '_sum' || key === '_count') {
      continue;
    }
    if (typeof value === 'string') {
      sort[convertFieldName(key)] = value.toLowerCase() === 'desc' ? -1 : 1;
    } else if (isObject(value)) {
      const nestedKey = Object.keys(value)[0];
      const nestedValue = value[nestedKey];
      sort[convertFieldName(nestedKey)] = nestedValue.toLowerCase() === 'desc' ? -1 : 1;
    }
  }
  return sort;
};

const attachRelations = async (modelName: string, docs: any[], include: any) => {
  if (!docs || docs.length === 0 || !include || typeof include !== 'object') {
    return;
  }

  const modelRelations = RELATION_MAP[modelName] ?? {};

  for (const [relationKey, relationInclude] of Object.entries(include)) {
    const relation = modelRelations[relationKey];
    if (!relation) continue;

    const nestedInclude = (relationInclude && typeof relationInclude === 'object')
      ? ((relationInclude as any).select || (relationInclude as any).include || relationInclude)
      : undefined;

    if (relation.isArray) {
      // doc._id may be a string (already serialized) or an ObjectId — normalize to ObjectId.
      const ids = docs
        .map((doc) => { const v = doc._id ?? doc.id; return v ? String(v) : null; })
        .filter((id): id is string => id !== null)
        .map((id: string) => Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id);
      if (ids.length === 0) continue;
      const arrayQuery = MODEL_MAP[relation.foreignModel].find({ [relation.foreignField]: { $in: ids } });
      const arrayOrderBy = relationInclude && typeof relationInclude === 'object' ? (relationInclude as any).orderBy : undefined;
      if (arrayOrderBy) arrayQuery.sort(buildSort(arrayOrderBy));
      const rawRelated = await arrayQuery.exec();

      // Serialize to plain objects BEFORE assigning. Raw Mongoose Documents strip
      // dynamically-set properties on .toObject(), so we must convert first.
      const relatedDocs = rawRelated.map(serializeDocument);

      const grouped: Record<string, any[]> = {};
      relatedDocs.forEach((item: any) => {
        const foreignId = (item[relation.foreignField] ?? item._id)?.toString();
        if (!foreignId) return;
        grouped[foreignId] = grouped[foreignId] ?? [];
        grouped[foreignId].push(item);
      });

      for (const doc of docs) {
        const key = (doc._id ?? doc.id)?.toString();
        doc[relationKey] = grouped[key] ?? [];
      }

      if (nestedInclude) {
        await attachRelations(relation.foreignModel, relatedDocs, nestedInclude);
      }
      continue;
    }

    const foreignIds = docs
      .map((doc) => doc[relation.localField])
      .filter(Boolean)
      .map((id) => String(id));
    if (foreignIds.length === 0) continue;

    // MongoDB _id is an ObjectId — querying with plain strings never matches.
    const foreignObjectIds = foreignIds.map((id: string) =>
      Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id
    );
    const rawRelated = await MODEL_MAP[relation.foreignModel]
      .find({ _id: { $in: foreignObjectIds } })
      .exec();

    // Serialize to plain objects to prevent dynamic property loss on .toObject().
    const relatedDocs = rawRelated.map(serializeDocument);

    const map: Record<string, any> = {};
    relatedDocs.forEach((item: any) => {
      const key = (item._id ?? item.id)?.toString();
      if (key) map[key] = item;
    });

    for (const doc of docs) {
      const id = doc[relation.localField]?.toString();
      doc[relationKey] = id ? map[id] ?? null : null;
    }

    if (nestedInclude) {
      await attachRelations(relation.foreignModel, relatedDocs, nestedInclude);
    }
  }
};

const toSerializableObject = (doc: any) => {
  if (!doc || typeof doc !== 'object') return doc;

  if (typeof doc.toObject === 'function') {
    const plain = doc.toObject({
      virtuals: false,
      getters: false,
      versionKey: false,
    });

    for (const [key, value] of Object.entries(doc)) {
      if (key === '$__' || key === '_doc' || key === '$isNew' || key.startsWith('$')) {
        continue;
      }
      if (!(key in plain)) {
        plain[key] = value;
      }
    }

    return plain;
  }

  if (isObject(doc._doc)) {
    return {
      ...doc._doc,
      ...Object.fromEntries(
        Object.entries(doc).filter(([key]) => key !== '_doc' && !key.startsWith('$'))
      ),
    };
  }

  return doc;
};

// Convert MongoDB _id field to Prisma-style id field for API responses
const serializeDocument = (doc: any): any => {
  if (doc == null) return doc;
  if (doc instanceof Date) return doc;
  if (isObjectIdLike(doc)) return doc.toString();
  if (typeof doc !== 'object') return doc;
  
  if (Array.isArray(doc)) {
    return doc.map((item) => serializeDocument(item));
  }

  const source = toSerializableObject(doc);
  const serialized: any = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === '_id' && value) {
      const id = String(value);
      // Add both _id and id to support different access patterns
      serialized.id = id;
      serialized._id = id;
    } else if (value instanceof Date) {
      serialized[key] = value;
    } else if (isObjectIdLike(value)) {
      serialized[key] = String(value);
    } else if (Array.isArray(value)) {
      serialized[key] = value.map((item) => serializeDocument(item));
    } else if (isObject(value)) {
      serialized[key] = serializeDocument(value);
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
};

const queryModel = async (
  modelName: string,
  args: any = {},
  options: { single?: boolean; session?: ClientSession } = {},
) => {
  const lowerName = modelName.toLowerCase();
  const model = MODEL_MAP[lowerName];
  if (!model) {
    throw new Error(`Unknown model: ${modelName}`);
  }

  const where = await translateWhere(args.where ?? {}, lowerName, options.session);
  const projection = buildProjection(lowerName, args.select);
  const include = normalizeInclude(lowerName, args);

  const query = options.single ? model.findOne(where) : model.find(where);
  if (options.session) query.session(options.session);
  if (projection) query.select(projection);
  if (args.orderBy) query.sort(buildSort(args.orderBy));
  if (!options.single && typeof args.skip === 'number') query.skip(args.skip);
  if (!options.single && typeof args.take === 'number') query.limit(args.take);

  const docs = await query.exec();
  const rawItems: any[] = options.single ? (docs ? [docs] : []) : (docs ?? []);

  // Serialize Mongoose Documents to plain JS objects BEFORE attaching relations.
  // Setting properties on raw Mongoose Documents is unreliable because .toObject()
  // strips dynamically added fields that are not part of the schema.
  const items = rawItems.map(serializeDocument);

  // Attach relations to the now-plain objects.
  await attachRelations(lowerName, items, include);

  // Second serialization pass: convert any nested Mongoose docs that attachRelations
  // may have attached as raw documents.
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    for (const key of Object.keys(item)) {
      const val = item[key];
      if (val && typeof val === 'object' && typeof val.toObject === 'function') {
        item[key] = serializeDocument(val);
      } else if (Array.isArray(val)) {
        item[key] = val.map((v: any) =>
          v && typeof v === 'object' && typeof v.toObject === 'function'
            ? serializeDocument(v)
            : v
        );
      }
    }
  }

  return options.single ? (items[0] ?? null) : items;
};

const buildUpdateData = (data: any) => {
  const update: any = {};
  const inc: any = {};

  for (const [key, value] of Object.entries(data ?? {})) {
    if (isObject(value) && ('increment' in value || 'decrement' in value)) {
      const change = value.increment ?? -value.decrement;
      if (typeof change === 'number') {
        inc[key] = change;
      }
      continue;
    }

    if (isObject(value) && 'set' in value && Object.keys(value).length === 1) {
      update[key] = value.set;
      continue;
    }

    update[key] = value;
  }

  const result: any = {};
  if (Object.keys(update).length > 0) result.$set = update;
  if (Object.keys(inc).length > 0) result.$inc = inc;
  return result;
};

/** Creates a single document via .save() (not Model.create()) so a transaction session attaches correctly. */
const saveNew = async (model: any, data: any, session?: ClientSession) => {
  const doc = new model(data);
  await doc.save(session ? { session } : undefined);
  return doc;
};

const createDocument = async (modelName: string, data: any, session?: ClientSession) => {
  const lowerName = modelName.toLowerCase();
  const model = MODEL_MAP[lowerName];
  if (!model) throw new Error(`Unknown model: ${modelName}`);

  if (lowerName === 'order' && data?.items?.create) {
    const itemsToCreate = data.items.create;
    const orderData = { ...data };
    delete orderData.items;

    const order = await saveNew(model, orderData, session);
    const createDocs = Array.isArray(itemsToCreate) ? itemsToCreate : [itemsToCreate];
    await OrderItem.insertMany(
      createDocs.map((item: any) => ({ ...item, orderId: order._id })),
      { session: session ?? null },
    );
    return serializeDocument(order);
  }

  if (lowerName === 'cart' && data?.items?.create) {
    const itemsToCreate = data.items.create;
    const cartData = { ...data };
    delete cartData.items;

    const cart = await saveNew(model, cartData, session);
    const createDocs = Array.isArray(itemsToCreate) ? itemsToCreate : [itemsToCreate];
    await CartItem.insertMany(
      createDocs.map((item: any) => ({ ...item, cartId: cart._id })),
      { session: session ?? null },
    );
    return serializeDocument(cart);
  }

  const created = await saveNew(model, data, session);
  return serializeDocument(created);
};

/** Bulk insert, mirroring Prisma's createMany contract: returns { count }, not the
 * created documents (callers that need the docs back use `create` in a loop instead). */
const createManyDocuments = async (modelName: string, data: any, session?: ClientSession) => {
  const lowerName = modelName.toLowerCase();
  const model = MODEL_MAP[lowerName];
  if (!model) throw new Error(`Unknown model: ${modelName}`);

  const docs = Array.isArray(data) ? data : [data];
  if (docs.length === 0) return { count: 0 };

  const created = await model.insertMany(docs, { session: session ?? null });
  return { count: created.length };
};

const buildAggregation = async (modelName: string, args: any, session?: ClientSession) => {
  const lowerName = modelName.toLowerCase();
  const model = MODEL_MAP[lowerName];
  if (!model) throw new Error(`Unknown model: ${modelName}`);

  const where = await translateWhere(args.where ?? {}, lowerName, session);
  const pipeline: any[] = [{ $match: where }];
  const group: any = { _id: null };

  if (args._sum) {
    for (const [field, enabled] of Object.entries(args._sum)) {
      if (enabled) group[`_sum_${field}`] = { $sum: `$${field}` };
    }
  }
  if (args._avg) {
    for (const [field, enabled] of Object.entries(args._avg)) {
      if (enabled) group[`_avg_${field}`] = { $avg: `$${field}` };
    }
  }
  if (args._count) {
    for (const [field, enabled] of Object.entries(args._count)) {
      if (enabled) group[`_count_${field}`] = { $sum: 1 };
    }
  }
  if (args._min) {
    for (const [field, enabled] of Object.entries(args._min)) {
      if (enabled) group[`_min_${field}`] = { $min: `$${field}` };
    }
  }
  if (args._max) {
    for (const [field, enabled] of Object.entries(args._max)) {
      if (enabled) group[`_max_${field}`] = { $max: `$${field}` };
    }
  }

  if (Object.keys(group).length > 1) {
    pipeline.push({ $group: group });
  }

  const result = await model.aggregate(pipeline).session(session ?? null).exec();
  const row = result[0] ?? {};
  const output = { _sum: {}, _avg: {}, _count: {}, _min: {}, _max: {} } as any;

  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('_sum_')) {
      output._sum[key.slice(5)] = value;
      continue;
    }
    if (key.startsWith('_avg_')) {
      output._avg[key.slice(5)] = value;
      continue;
    }
    if (key.startsWith('_count_')) {
      output._count[key.slice(7)] = value;
      continue;
    }
    if (key.startsWith('_min_')) {
      output._min[key.slice(5)] = value;
      continue;
    }
    if (key.startsWith('_max_')) {
      output._max[key.slice(5)] = value;
      continue;
    }
  }

  return output;
};

const buildGroupBy = async (modelName: string, args: any, session?: ClientSession) => {
  const lowerName = modelName.toLowerCase();
  const model = MODEL_MAP[lowerName];
  if (!model) throw new Error(`Unknown model: ${modelName}`);

  const where = await translateWhere(args.where ?? {}, lowerName, session);
  const groupFields = Array.isArray(args.by) ? args.by : [args.by];
  const groupId: any = groupFields.length === 1 ? `$${convertFieldName(groupFields[0])}` : {};
  if (Array.isArray(groupFields)) {
    groupFields.forEach((field) => {
      if (groupFields.length > 1) groupId[field] = `$${convertFieldName(field)}`;
    });
  }

  const groupStage: any = { _id: groupId };
  if (args._sum) {
    for (const [field, enabled] of Object.entries(args._sum)) {
      if (enabled) {
        groupStage[`_sum_${field}`] = { $sum: `$${convertFieldName(field)}` };
      }
    }
  }
  if (args._avg) {
    for (const [field, enabled] of Object.entries(args._avg)) {
      if (enabled) {
        groupStage[`_avg_${field}`] = { $avg: `$${convertFieldName(field)}` };
      }
    }
  }
  if (args._count) {
    for (const [field, enabled] of Object.entries(args._count)) {
      if (enabled) {
        groupStage[`_count_${field}`] = { $sum: 1 };
      }
    }
  }

  const pipeline: any[] = [{ $match: where }, { $group: groupStage }];

  if (args.orderBy) {
    const sort: any = {};
    for (const [key, value] of Object.entries(args.orderBy)) {
      if (key === '_sum' || key === '_avg' || key === '_count') {
        const sub = value as Record<string, string>;
        for (const [subKey, subValue] of Object.entries(sub)) {
          const path = `_${key}_${subKey}`;
          sort[path] = subValue.toLowerCase() === 'desc' ? -1 : 1;
        }
      }
    }
    if (Object.keys(sort).length > 0) pipeline.push({ $sort: sort });
  }

  if (typeof args.take === 'number') pipeline.push({ $limit: args.take });

  const rows = await model.aggregate(pipeline).session(session ?? null).exec();
  return rows.map((row: any) => {
    const mapped: any = {};
    if (groupFields.length === 1) {
      mapped[groupFields[0]] = row._id;
    } else {
      Object.assign(mapped, row._id);
    }
    mapped._sum = {};
    mapped._avg = {};
    mapped._count = {};
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('_sum_')) {
        mapped._sum[key.slice(5)] = value;
      }
      if (key.startsWith('_avg_')) {
        mapped._avg[key.slice(5)] = value;
      }
      if (key.startsWith('_count_')) {
        mapped._count[key.slice(7)] = value;
      }
    }
    if (Object.keys(mapped._sum).length === 0) delete mapped._sum;
    if (Object.keys(mapped._avg).length === 0) delete mapped._avg;
    if (Object.keys(mapped._count).length === 0) delete mapped._count;
    return mapped;
  });
};

/**
 * A PrismaBridge instance is either the global, session-less singleton, or a
 * session-bound instance created for the lifetime of a single $transaction callback.
 * Every method threads `this.session` (undefined outside a transaction) through to the
 * underlying Mongoose calls, so `tx.model.method()` inside `prisma.$transaction(async
 * (tx) => {...})` participates in the same real MongoDB transaction — all-or-nothing,
 * not the no-op it used to be (the previous implementation just called the callback
 * with the plain global `prisma`, with no session, no atomicity, and no rollback).
 */
class PrismaBridge {
  constructor(private readonly session?: ClientSession) {}

  async findUnique(modelName: string, args: any) {
    return queryModel(modelName, args, { single: true, session: this.session });
  }

  async findFirst(modelName: string, args: any) {
    return queryModel(modelName, args, { single: true, session: this.session });
  }

  async findMany(modelName: string, args: any) {
    return queryModel(modelName, args, { single: false, session: this.session });
  }

  async count(modelName: string, args: any) {
    const lowerName = modelName.toLowerCase();
    const model = MODEL_MAP[lowerName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);
    const where = await translateWhere(args?.where ?? {}, lowerName, this.session);
    return model.countDocuments(where).session(this.session ?? null).exec();
  }

  async create(modelName: string, args: any) {
    return createDocument(modelName, args.data, this.session);
  }

  async createMany(modelName: string, args: any) {
    return createManyDocuments(modelName, args.data, this.session);
  }

  async update(modelName: string, args: any) {
    const lowerName = modelName.toLowerCase();
    const model = MODEL_MAP[lowerName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);

    const where = await translateWhere(args.where ?? {}, lowerName, this.session);
    const updateData = buildUpdateData(args.data);
    const updated = await model
      .findOneAndUpdate(where, updateData, { new: true, session: this.session })
      .exec();
    return serializeDocument(updated);
  }

  async delete(modelName: string, args: any) {
    const lowerName = modelName.toLowerCase();
    const model = MODEL_MAP[lowerName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);
    const where = await translateWhere(args.where ?? {}, lowerName, this.session);
    const deleted = await model.findOneAndDelete(where, { session: this.session }).exec();
    return serializeDocument(deleted);
  }

  async deleteMany(modelName: string, args: any) {
    const lowerName = modelName.toLowerCase();
    const model = MODEL_MAP[lowerName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);
    const where = await translateWhere(args.where ?? {}, lowerName, this.session);
    const result = await model.deleteMany(where, { session: this.session }).exec();
    // Prisma's deleteMany returns { count: number } (Prisma.BatchPayload) — the raw
    // Mongoose result shape is { acknowledged, deletedCount }. Reshaping here, not at
    // each call site, so every caller that follows the Prisma contract gets it right.
    return { count: result.deletedCount ?? 0 };
  }

  async updateMany(modelName: string, args: any) {
    const lowerName = modelName.toLowerCase();
    const model = MODEL_MAP[lowerName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);
    const where = await translateWhere(args.where ?? {}, lowerName, this.session);
    const updateData = buildUpdateData(args.data);
    const result = await model.updateMany(where, updateData, { session: this.session }).exec();
    // Prisma's updateMany returns { count: number } (Prisma.BatchPayload) — the raw
    // Mongoose result shape is { acknowledged, matchedCount, modifiedCount }. This was a
    // real, live-verified bug: order.controller.ts's deductStock() checked
    // `result.count === 0` to detect insufficient stock and abort the order, but the
    // bridge previously returned the raw Mongoose shape (no `.count` field at all), so
    // that check silently never fired — a race between two checkouts for the last unit
    // of stock could both report success. `count` here is matchedCount, not
    // modifiedCount: a filter that matched zero documents (e.g. `stock: { gte: N }`
    // failing) is exactly the "nothing to update" signal callers check for, regardless
    // of whether the modification itself would have been a no-op.
    return { count: result.matchedCount ?? 0 };
  }

  async upsert(modelName: string, args: any) {
    const lowerName = modelName.toLowerCase();
    const model = MODEL_MAP[lowerName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);
    const where = await translateWhere(args.where ?? {}, lowerName, this.session);
    const updateData = buildUpdateData(args.update);
    const options = { new: true, upsert: true, setDefaultsOnInsert: true, session: this.session };
    const result = await model.findOneAndUpdate(where, updateData, options).exec();
    return serializeDocument(result);
  }

  async aggregate(modelName: string, args: any) {
    return buildAggregation(modelName, args, this.session);
  }

  async groupBy(modelName: string, args: any) {
    return buildGroupBy(modelName, args, this.session);
  }

  async $transaction(arg: any) {
    if (Array.isArray(arg)) {
      // The array form receives already-invoked promises — by the time $transaction
      // sees them, their underlying Mongoose operations have already started executing
      // without a session, so there is no way to make them atomic after the fact. Fail
      // loudly rather than silently returning non-atomic results under a name that
      // promises atomicity. Use the callback form instead: $transaction(async (tx) => {...}).
      throw new Error(
        '$transaction([...]) (array form) cannot be made atomic through this bridge — ' +
          'use the callback form: $transaction(async (tx) => { await tx.model.create(...); ... }).',
      );
    }
    if (typeof arg !== 'function') {
      throw new Error('$transaction expects a callback function: $transaction(async (tx) => {...})');
    }

    const session = await mongoose.startSession();
    try {
      let result: any;
      await session.withTransaction(async () => {
        const sessionBoundBridge = createBridgeProxy(new PrismaBridge(session));
        result = await arg(sessionBoundBridge);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
}

function createBridgeProxy(target: PrismaBridge) {
  return new Proxy(target, {
    get(target, property) {
      if (typeof property !== 'string') return undefined;
      if (property.startsWith('$')) {
        return (target as any)[property]?.bind(target);
      }
      return {
        findUnique: (args: any) => target.findUnique(property, args),
        findFirst: (args: any) => target.findFirst(property, args),
        findMany: (args: any) => target.findMany(property, args),
        count: (args: any) => target.count(property, args),
        create: (args: any) => target.create(property, args),
        createMany: (args: any) => target.createMany(property, args),
        update: (args: any) => target.update(property, args),
        delete: (args: any) => target.delete(property, args),
        deleteMany: (args: any) => target.deleteMany(property, args),
        updateMany: (args: any) => target.updateMany(property, args),
        upsert: (args: any) => target.upsert(property, args),
        aggregate: (args: any) => target.aggregate(property, args),
        groupBy: (args: any) => target.groupBy(property, args),
      };
    },
  });
}

const bridge = createBridgeProxy(new PrismaBridge());

declare global {
  var prisma: any;
}

globalThis.prisma = bridge as any;

export { bridge as prisma };
