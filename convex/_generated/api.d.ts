/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as admin from "../admin.js";
import type * as adminEmails from "../adminEmails.js";
import type * as auth from "../auth.js";
import type * as availability from "../availability.js";
import type * as balances from "../balances.js";
import type * as blog from "../blog.js";
import type * as booking from "../booking.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as devtools from "../devtools.js";
import type * as emailMeta from "../emailMeta.js";
import type * as emails from "../emails.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as lib from "../lib.js";
import type * as marketing from "../marketing.js";
import type * as messages from "../messages.js";
import type * as notify from "../notify.js";
import type * as reviews from "../reviews.js";
import type * as settings from "../settings.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as turn from "../turn.js";
import type * as tutors from "../tutors.js";
import type * as users from "../users.js";
import type * as verification from "../verification.js";
import type * as video from "../video.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  admin: typeof admin;
  adminEmails: typeof adminEmails;
  auth: typeof auth;
  availability: typeof availability;
  balances: typeof balances;
  blog: typeof blog;
  booking: typeof booking;
  content: typeof content;
  crons: typeof crons;
  devtools: typeof devtools;
  emailMeta: typeof emailMeta;
  emails: typeof emails;
  files: typeof files;
  http: typeof http;
  lessons: typeof lessons;
  lib: typeof lib;
  marketing: typeof marketing;
  messages: typeof messages;
  notify: typeof notify;
  reviews: typeof reviews;
  settings: typeof settings;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
  turn: typeof turn;
  tutors: typeof tutors;
  users: typeof users;
  verification: typeof verification;
  video: typeof video;
  wallet: typeof wallet;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
