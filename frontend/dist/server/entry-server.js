var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { useState, useEffect, useRef, Component, useMemo, useCallback } from "react";
import { stripBasename, UNSAFE_warning, UNSAFE_invariant, matchPath, joinPaths, Action } from "@remix-run/router";
import { UNSAFE_NavigationContext, useHref, useNavigate, useLocation, useResolvedPath, createPath, UNSAFE_DataRouterStateContext, UNSAFE_useRouteId, UNSAFE_RouteContext, UNSAFE_DataRouterContext, parsePath, Router, Outlet, Navigate, Routes, Route } from "react-router";
import "react-dom";
import { ChevronDown, Sun, Moon, Crown, X, Menu, AlertTriangle, RotateCcw, TrendingUp, Zap, Lock, ArrowRight, Sparkles, Star, Activity, FileText, Linkedin, Github, Layout as Layout$1, BookOpen, Lightbulb, CheckCircle2, Users, ChevronRight, MessageCircle, Check, Rocket, Loader, Plus, Minus, ArrowLeft, Map as Map$1, Gauge, Search, ListChecks, Target, ExternalLink, Clock, Briefcase, ShieldCheck, Monitor, Mail, Calendar, User, CheckCircle, Copy, Download, XCircle, Trash2, Edit2, MapPin, Loader2, AlertCircle, ChevronLeft, ChevronUp, UploadCloud, ShieldAlert, Code2, RefreshCw, BarChart2, TrendingDown, HelpCircle, Award, Code, BrainCircuit, Wrench, Play, FileCode2, Mic, Send, Info, GraduationCap, Bot, Terminal, Tags, Eye, GitCompare, MonitorOff, LogIn } from "lucide-react";
import { create } from "zustand";
import axios from "axios";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from "recharts";
/**
 * React Router DOM v6.30.3
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */
function _extends() {
  _extends = Object.assign ? Object.assign.bind() : function(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;
  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }
  return target;
}
const defaultMethod = "get";
const defaultEncType = "application/x-www-form-urlencoded";
function isHtmlElement(object) {
  return object != null && typeof object.tagName === "string";
}
function isButtonElement(object) {
  return isHtmlElement(object) && object.tagName.toLowerCase() === "button";
}
function isFormElement(object) {
  return isHtmlElement(object) && object.tagName.toLowerCase() === "form";
}
function isInputElement(object) {
  return isHtmlElement(object) && object.tagName.toLowerCase() === "input";
}
function isModifiedEvent(event) {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}
function shouldProcessLinkClick(event, target) {
  return event.button === 0 && // Ignore everything but left clicks
  (!target || target === "_self") && // Let browser handle "target=_blank" etc.
  !isModifiedEvent(event);
}
let _formDataSupportsSubmitter = null;
function isFormDataSubmitterSupported() {
  if (_formDataSupportsSubmitter === null) {
    try {
      new FormData(
        document.createElement("form"),
        // @ts-expect-error if FormData supports the submitter parameter, this will throw
        0
      );
      _formDataSupportsSubmitter = false;
    } catch (e) {
      _formDataSupportsSubmitter = true;
    }
  }
  return _formDataSupportsSubmitter;
}
const supportedFormEncTypes = /* @__PURE__ */ new Set(["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]);
function getFormEncType(encType) {
  if (encType != null && !supportedFormEncTypes.has(encType)) {
    process.env.NODE_ENV !== "production" ? UNSAFE_warning(false, '"' + encType + '" is not a valid `encType` for `<Form>`/`<fetcher.Form>` ' + ('and will default to "' + defaultEncType + '"')) : void 0;
    return null;
  }
  return encType;
}
function getFormSubmissionInfo(target, basename) {
  let method;
  let action;
  let encType;
  let formData;
  let body;
  if (isFormElement(target)) {
    let attr = target.getAttribute("action");
    action = attr ? stripBasename(attr, basename) : null;
    method = target.getAttribute("method") || defaultMethod;
    encType = getFormEncType(target.getAttribute("enctype")) || defaultEncType;
    formData = new FormData(target);
  } else if (isButtonElement(target) || isInputElement(target) && (target.type === "submit" || target.type === "image")) {
    let form = target.form;
    if (form == null) {
      throw new Error('Cannot submit a <button> or <input type="submit"> without a <form>');
    }
    let attr = target.getAttribute("formaction") || form.getAttribute("action");
    action = attr ? stripBasename(attr, basename) : null;
    method = target.getAttribute("formmethod") || form.getAttribute("method") || defaultMethod;
    encType = getFormEncType(target.getAttribute("formenctype")) || getFormEncType(form.getAttribute("enctype")) || defaultEncType;
    formData = new FormData(form, target);
    if (!isFormDataSubmitterSupported()) {
      let {
        name,
        type,
        value
      } = target;
      if (type === "image") {
        let prefix = name ? name + "." : "";
        formData.append(prefix + "x", "0");
        formData.append(prefix + "y", "0");
      } else if (name) {
        formData.append(name, value);
      }
    }
  } else if (isHtmlElement(target)) {
    throw new Error('Cannot submit element that is not <form>, <button>, or <input type="submit|image">');
  } else {
    method = defaultMethod;
    action = null;
    encType = defaultEncType;
    body = target;
  }
  if (formData && encType === "text/plain") {
    body = formData;
    formData = void 0;
  }
  return {
    action,
    method: method.toLowerCase(),
    encType,
    formData,
    body
  };
}
const _excluded = ["onClick", "relative", "reloadDocument", "replace", "state", "target", "to", "preventScrollReset", "viewTransition"], _excluded2 = ["aria-current", "caseSensitive", "className", "end", "style", "to", "viewTransition", "children"], _excluded3 = ["fetcherKey", "navigate", "reloadDocument", "replace", "state", "method", "action", "onSubmit", "relative", "preventScrollReset", "viewTransition"];
const REACT_ROUTER_VERSION = "6";
try {
  window.__reactRouterVersion = REACT_ROUTER_VERSION;
} catch (e) {
}
const ViewTransitionContext = /* @__PURE__ */ React.createContext({
  isTransitioning: false
});
if (process.env.NODE_ENV !== "production") {
  ViewTransitionContext.displayName = "ViewTransition";
}
const FetchersContext = /* @__PURE__ */ React.createContext(/* @__PURE__ */ new Map());
if (process.env.NODE_ENV !== "production") {
  FetchersContext.displayName = "Fetchers";
}
if (process.env.NODE_ENV !== "production") ;
const isBrowser$1 = typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined";
const ABSOLUTE_URL_REGEX$1 = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const Link = /* @__PURE__ */ React.forwardRef(function LinkWithRef(_ref7, ref) {
  let {
    onClick,
    relative,
    reloadDocument,
    replace,
    state,
    target,
    to,
    preventScrollReset,
    viewTransition
  } = _ref7, rest = _objectWithoutPropertiesLoose(_ref7, _excluded);
  let {
    basename
  } = React.useContext(UNSAFE_NavigationContext);
  let absoluteHref;
  let isExternal = false;
  if (typeof to === "string" && ABSOLUTE_URL_REGEX$1.test(to)) {
    absoluteHref = to;
    if (isBrowser$1) {
      try {
        let currentUrl = new URL(window.location.href);
        let targetUrl = to.startsWith("//") ? new URL(currentUrl.protocol + to) : new URL(to);
        let path = stripBasename(targetUrl.pathname, basename);
        if (targetUrl.origin === currentUrl.origin && path != null) {
          to = path + targetUrl.search + targetUrl.hash;
        } else {
          isExternal = true;
        }
      } catch (e) {
        process.env.NODE_ENV !== "production" ? UNSAFE_warning(false, '<Link to="' + to + '"> contains an invalid URL which will probably break when clicked - please update to a valid URL path.') : void 0;
      }
    }
  }
  let href = useHref(to, {
    relative
  });
  let internalOnClick = useLinkClickHandler(to, {
    replace,
    state,
    target,
    preventScrollReset,
    relative,
    viewTransition
  });
  function handleClick(event) {
    if (onClick) onClick(event);
    if (!event.defaultPrevented) {
      internalOnClick(event);
    }
  }
  return (
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    /* @__PURE__ */ React.createElement("a", _extends({}, rest, {
      href: absoluteHref || href,
      onClick: isExternal || reloadDocument ? onClick : handleClick,
      ref,
      target
    }))
  );
});
if (process.env.NODE_ENV !== "production") {
  Link.displayName = "Link";
}
const NavLink = /* @__PURE__ */ React.forwardRef(function NavLinkWithRef(_ref8, ref) {
  let {
    "aria-current": ariaCurrentProp = "page",
    caseSensitive = false,
    className: classNameProp = "",
    end = false,
    style: styleProp,
    to,
    viewTransition,
    children
  } = _ref8, rest = _objectWithoutPropertiesLoose(_ref8, _excluded2);
  let path = useResolvedPath(to, {
    relative: rest.relative
  });
  let location = useLocation();
  let routerState = React.useContext(UNSAFE_DataRouterStateContext);
  let {
    navigator: navigator2,
    basename
  } = React.useContext(UNSAFE_NavigationContext);
  let isTransitioning = routerState != null && // Conditional usage is OK here because the usage of a data router is static
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useViewTransitionState(path) && viewTransition === true;
  let toPathname = navigator2.encodeLocation ? navigator2.encodeLocation(path).pathname : path.pathname;
  let locationPathname = location.pathname;
  let nextLocationPathname = routerState && routerState.navigation && routerState.navigation.location ? routerState.navigation.location.pathname : null;
  if (!caseSensitive) {
    locationPathname = locationPathname.toLowerCase();
    nextLocationPathname = nextLocationPathname ? nextLocationPathname.toLowerCase() : null;
    toPathname = toPathname.toLowerCase();
  }
  if (nextLocationPathname && basename) {
    nextLocationPathname = stripBasename(nextLocationPathname, basename) || nextLocationPathname;
  }
  const endSlashPosition = toPathname !== "/" && toPathname.endsWith("/") ? toPathname.length - 1 : toPathname.length;
  let isActive = locationPathname === toPathname || !end && locationPathname.startsWith(toPathname) && locationPathname.charAt(endSlashPosition) === "/";
  let isPending = nextLocationPathname != null && (nextLocationPathname === toPathname || !end && nextLocationPathname.startsWith(toPathname) && nextLocationPathname.charAt(toPathname.length) === "/");
  let renderProps = {
    isActive,
    isPending,
    isTransitioning
  };
  let ariaCurrent = isActive ? ariaCurrentProp : void 0;
  let className;
  if (typeof classNameProp === "function") {
    className = classNameProp(renderProps);
  } else {
    className = [classNameProp, isActive ? "active" : null, isPending ? "pending" : null, isTransitioning ? "transitioning" : null].filter(Boolean).join(" ");
  }
  let style = typeof styleProp === "function" ? styleProp(renderProps) : styleProp;
  return /* @__PURE__ */ React.createElement(Link, _extends({}, rest, {
    "aria-current": ariaCurrent,
    className,
    ref,
    style,
    to,
    viewTransition
  }), typeof children === "function" ? children(renderProps) : children);
});
if (process.env.NODE_ENV !== "production") {
  NavLink.displayName = "NavLink";
}
const Form = /* @__PURE__ */ React.forwardRef((_ref9, forwardedRef) => {
  let {
    fetcherKey,
    navigate,
    reloadDocument,
    replace,
    state,
    method = defaultMethod,
    action,
    onSubmit,
    relative,
    preventScrollReset,
    viewTransition
  } = _ref9, props = _objectWithoutPropertiesLoose(_ref9, _excluded3);
  let submit = useSubmit();
  let formAction = useFormAction(action, {
    relative
  });
  let formMethod = method.toLowerCase() === "get" ? "get" : "post";
  let submitHandler = (event) => {
    onSubmit && onSubmit(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    let submitter = event.nativeEvent.submitter;
    let submitMethod = (submitter == null ? void 0 : submitter.getAttribute("formmethod")) || method;
    submit(submitter || event.currentTarget, {
      fetcherKey,
      method: submitMethod,
      navigate,
      replace,
      state,
      relative,
      preventScrollReset,
      viewTransition
    });
  };
  return /* @__PURE__ */ React.createElement("form", _extends({
    ref: forwardedRef,
    method: formMethod,
    action: formAction,
    onSubmit: reloadDocument ? onSubmit : submitHandler
  }, props));
});
if (process.env.NODE_ENV !== "production") {
  Form.displayName = "Form";
}
if (process.env.NODE_ENV !== "production") ;
var DataRouterHook;
(function(DataRouterHook2) {
  DataRouterHook2["UseScrollRestoration"] = "useScrollRestoration";
  DataRouterHook2["UseSubmit"] = "useSubmit";
  DataRouterHook2["UseSubmitFetcher"] = "useSubmitFetcher";
  DataRouterHook2["UseFetcher"] = "useFetcher";
  DataRouterHook2["useViewTransitionState"] = "useViewTransitionState";
})(DataRouterHook || (DataRouterHook = {}));
var DataRouterStateHook;
(function(DataRouterStateHook2) {
  DataRouterStateHook2["UseFetcher"] = "useFetcher";
  DataRouterStateHook2["UseFetchers"] = "useFetchers";
  DataRouterStateHook2["UseScrollRestoration"] = "useScrollRestoration";
})(DataRouterStateHook || (DataRouterStateHook = {}));
function getDataRouterConsoleError(hookName) {
  return hookName + " must be used within a data router.  See https://reactrouter.com/v6/routers/picking-a-router.";
}
function useDataRouterContext(hookName) {
  let ctx = React.useContext(UNSAFE_DataRouterContext);
  !ctx ? process.env.NODE_ENV !== "production" ? UNSAFE_invariant(false, getDataRouterConsoleError(hookName)) : UNSAFE_invariant(false) : void 0;
  return ctx;
}
function useLinkClickHandler(to, _temp) {
  let {
    target,
    replace: replaceProp,
    state,
    preventScrollReset,
    relative,
    viewTransition
  } = _temp === void 0 ? {} : _temp;
  let navigate = useNavigate();
  let location = useLocation();
  let path = useResolvedPath(to, {
    relative
  });
  return React.useCallback((event) => {
    if (shouldProcessLinkClick(event, target)) {
      event.preventDefault();
      let replace = replaceProp !== void 0 ? replaceProp : createPath(location) === createPath(path);
      navigate(to, {
        replace,
        state,
        preventScrollReset,
        relative,
        viewTransition
      });
    }
  }, [location, navigate, path, replaceProp, state, target, to, preventScrollReset, relative, viewTransition]);
}
function validateClientSideSubmission() {
  if (typeof document === "undefined") {
    throw new Error("You are calling submit during the server render. Try calling submit within a `useEffect` or callback instead.");
  }
}
let fetcherId = 0;
let getUniqueFetcherId = () => "__" + String(++fetcherId) + "__";
function useSubmit() {
  let {
    router
  } = useDataRouterContext(DataRouterHook.UseSubmit);
  let {
    basename
  } = React.useContext(UNSAFE_NavigationContext);
  let currentRouteId = UNSAFE_useRouteId();
  return React.useCallback(function(target, options) {
    if (options === void 0) {
      options = {};
    }
    validateClientSideSubmission();
    let {
      action,
      method,
      encType,
      formData,
      body
    } = getFormSubmissionInfo(target, basename);
    if (options.navigate === false) {
      let key = options.fetcherKey || getUniqueFetcherId();
      router.fetch(key, currentRouteId, options.action || action, {
        preventScrollReset: options.preventScrollReset,
        formData,
        body,
        formMethod: options.method || method,
        formEncType: options.encType || encType,
        flushSync: options.flushSync
      });
    } else {
      router.navigate(options.action || action, {
        preventScrollReset: options.preventScrollReset,
        formData,
        body,
        formMethod: options.method || method,
        formEncType: options.encType || encType,
        replace: options.replace,
        state: options.state,
        fromRouteId: currentRouteId,
        flushSync: options.flushSync,
        viewTransition: options.viewTransition
      });
    }
  }, [router, basename, currentRouteId]);
}
function useFormAction(action, _temp2) {
  let {
    relative
  } = _temp2 === void 0 ? {} : _temp2;
  let {
    basename
  } = React.useContext(UNSAFE_NavigationContext);
  let routeContext = React.useContext(UNSAFE_RouteContext);
  !routeContext ? process.env.NODE_ENV !== "production" ? UNSAFE_invariant(false, "useFormAction must be used inside a RouteContext") : UNSAFE_invariant(false) : void 0;
  let [match] = routeContext.matches.slice(-1);
  let path = _extends({}, useResolvedPath(action ? action : ".", {
    relative
  }));
  let location = useLocation();
  if (action == null) {
    path.search = location.search;
    let params = new URLSearchParams(path.search);
    let indexValues = params.getAll("index");
    let hasNakedIndexParam = indexValues.some((v) => v === "");
    if (hasNakedIndexParam) {
      params.delete("index");
      indexValues.filter((v) => v).forEach((v) => params.append("index", v));
      let qs = params.toString();
      path.search = qs ? "?" + qs : "";
    }
  }
  if ((!action || action === ".") && match.route.index) {
    path.search = path.search ? path.search.replace(/^\?/, "?index&") : "?index";
  }
  if (basename !== "/") {
    path.pathname = path.pathname === "/" ? basename : joinPaths([basename, path.pathname]);
  }
  return createPath(path);
}
function useViewTransitionState(to, opts) {
  if (opts === void 0) {
    opts = {};
  }
  let vtContext = React.useContext(ViewTransitionContext);
  !(vtContext != null) ? process.env.NODE_ENV !== "production" ? UNSAFE_invariant(false, "`useViewTransitionState` must be used within `react-router-dom`'s `RouterProvider`.  Did you accidentally import `RouterProvider` from `react-router`?") : UNSAFE_invariant(false) : void 0;
  let {
    basename
  } = useDataRouterContext(DataRouterHook.useViewTransitionState);
  let path = useResolvedPath(to, {
    relative: opts.relative
  });
  if (!vtContext.isTransitioning) {
    return false;
  }
  let currentPath = stripBasename(vtContext.currentLocation.pathname, basename) || vtContext.currentLocation.pathname;
  let nextPath = stripBasename(vtContext.nextLocation.pathname, basename) || vtContext.nextLocation.pathname;
  return matchPath(path.pathname, nextPath) != null || matchPath(path.pathname, currentPath) != null;
}
function StaticRouter({
  basename,
  children,
  location: locationProp = "/",
  future
}) {
  if (typeof locationProp === "string") {
    locationProp = parsePath(locationProp);
  }
  let action = Action.Pop;
  let location = {
    pathname: locationProp.pathname || "/",
    search: locationProp.search || "",
    hash: locationProp.hash || "",
    state: locationProp.state != null ? locationProp.state : null,
    key: locationProp.key || "default"
  };
  let staticNavigator = getStatelessNavigator();
  return /* @__PURE__ */ React.createElement(Router, {
    basename,
    children,
    location,
    navigationType: action,
    navigator: staticNavigator,
    future,
    static: true
  });
}
function getStatelessNavigator() {
  return {
    createHref,
    encodeLocation,
    push(to) {
      throw new Error(`You cannot use navigator.push() on the server because it is a stateless environment. This error was probably triggered when you did a \`navigate(${JSON.stringify(to)})\` somewhere in your app.`);
    },
    replace(to) {
      throw new Error(`You cannot use navigator.replace() on the server because it is a stateless environment. This error was probably triggered when you did a \`navigate(${JSON.stringify(to)}, { replace: true })\` somewhere in your app.`);
    },
    go(delta) {
      throw new Error(`You cannot use navigator.go() on the server because it is a stateless environment. This error was probably triggered when you did a \`navigate(${delta})\` somewhere in your app.`);
    },
    back() {
      throw new Error(`You cannot use navigator.back() on the server because it is a stateless environment.`);
    },
    forward() {
      throw new Error(`You cannot use navigator.forward() on the server because it is a stateless environment.`);
    }
  };
}
function createHref(to) {
  return typeof to === "string" ? to : createPath(to);
}
function encodeLocation(to) {
  let href = typeof to === "string" ? to : createPath(to);
  href = href.replace(/ $/, "%20");
  let encoded = ABSOLUTE_URL_REGEX.test(href) ? new URL(href) : new URL(href, "http://localhost");
  return {
    pathname: encoded.pathname,
    search: encoded.search,
    hash: encoded.hash
  };
}
const ABSOLUTE_URL_REGEX = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const isBrowser = typeof window !== "undefined";
function safeLocalStorage(key) {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function setSafeLocalStorage(key, value) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}
function removeSafeLocalStorage(key) {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(key);
  } catch {
  }
}
const apiBase = "http://localhost:3000/api";
const api = axios.create({
  baseURL: apiBase
});
function persistSession({ token, refreshToken, sessionId }) {
  if (token) setSafeLocalStorage("token", token);
  if (refreshToken) setSafeLocalStorage("refreshToken", refreshToken);
  if (sessionId) setSafeLocalStorage("sessionId", String(sessionId));
}
function clearSession() {
  removeSafeLocalStorage("token");
  removeSafeLocalStorage("refreshToken");
  removeSafeLocalStorage("sessionId");
}
function handleSessionSuperseded(message) {
  clearSession();
  useAuthStore.getState().setSessionBlocked(
    message || "This account was signed in on another device."
  );
}
api.interceptors.request.use((config) => {
  const token = safeLocalStorage("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
let isRefreshing = false;
let refreshQueue = [];
function processRefreshQueue(error, token = null) {
  refreshQueue.forEach((promise) => {
    if (error) promise.reject(error);
    else promise.resolve(token);
  });
  refreshQueue = [];
}
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const original = error.config;
    const code = (_b = (_a = error.response) == null ? void 0 : _a.data) == null ? void 0 : _b.code;
    if (code === "SESSION_SUPERSEDED") {
      handleSessionSuperseded((_d = (_c = error.response) == null ? void 0 : _c.data) == null ? void 0 : _d.error);
      return Promise.reject(error);
    }
    if (!original || original._retry) return Promise.reject(error);
    if (((_e = error.response) == null ? void 0 : _e.status) !== 401) return Promise.reject(error);
    const refreshToken = safeLocalStorage("refreshToken");
    if (!refreshToken) {
      clearSession();
      useAuthStore.getState().resetAuth();
      return Promise.reject(error);
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }
    original._retry = true;
    isRefreshing = true;
    try {
      const { data } = await axios.post(`${apiBase}/auth/refresh`, { refreshToken });
      if (data.code === "SESSION_SUPERSEDED") {
        handleSessionSuperseded(data.error);
        return Promise.reject(error);
      }
      setSafeLocalStorage("token", data.token);
      if ((_f = data.session) == null ? void 0 : _f.id) setSafeLocalStorage("sessionId", String(data.session.id));
      processRefreshQueue(null, data.token);
      original.headers.Authorization = `Bearer ${data.token}`;
      return api(original);
    } catch (refreshError) {
      const refreshCode = (_h = (_g = refreshError.response) == null ? void 0 : _g.data) == null ? void 0 : _h.code;
      if (refreshCode === "SESSION_SUPERSEDED") {
        handleSessionSuperseded((_j = (_i = refreshError.response) == null ? void 0 : _i.data) == null ? void 0 : _j.error);
      } else {
        clearSession();
        useAuthStore.getState().resetAuth();
      }
      processRefreshQueue(refreshError, null);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
const useAuthStore = create((set) => ({
  user: null,
  sessionId: safeLocalStorage("sessionId"),
  isAuthenticated: false,
  isLoading: isBrowser,
  error: null,
  hasCompletedOnboarding: false,
  sessionBlocked: false,
  sessionBlockedMessage: null,
  accountInUse: null,
  resetAuth: () => set({
    user: null,
    sessionId: null,
    isAuthenticated: false,
    isLoading: false,
    hasCompletedOnboarding: false,
    sessionBlocked: false,
    sessionBlockedMessage: null,
    accountInUse: null
  }),
  setSessionBlocked: (message) => set({
    sessionBlocked: true,
    sessionBlockedMessage: message,
    isAuthenticated: false,
    user: null,
    sessionId: null,
    isLoading: false
  }),
  clearSessionBlocked: () => set({
    sessionBlocked: false,
    sessionBlockedMessage: null,
    accountInUse: null,
    error: null
  }),
  clearAccountInUse: () => set({ accountInUse: null, error: null }),
  login: async (credentials, { replaceDevice = false } = {}) => {
    var _a, _b, _c, _d, _e, _f;
    set({ isLoading: true, error: null, accountInUse: null });
    try {
      const { data } = await api.post("/auth/login", { ...credentials, replaceDevice });
      persistSession(data);
      set({
        user: data.user,
        sessionId: ((_a = data.session) == null ? void 0 : _a.id) || null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        accountInUse: null,
        sessionBlocked: false,
        sessionBlockedMessage: null
      });
      return data;
    } catch (err) {
      if (((_b = err.response) == null ? void 0 : _b.status) === 409 && ((_d = (_c = err.response) == null ? void 0 : _c.data) == null ? void 0 : _d.code) === "ACCOUNT_IN_USE") {
        set({
          accountInUse: err.response.data.activeSession,
          error: err.response.data.error,
          isLoading: false,
          isAuthenticated: false
        });
        const blocked = new Error("ACCOUNT_IN_USE");
        blocked.code = "ACCOUNT_IN_USE";
        throw blocked;
      }
      const message = ((_f = (_e = err.response) == null ? void 0 : _e.data) == null ? void 0 : _f.error) || "Login failed";
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw new Error(message);
    }
  },
  signup: async (userData) => {
    var _a, _b, _c;
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/auth/signup", userData);
      persistSession(data);
      set({
        user: data.user,
        sessionId: ((_a = data.session) == null ? void 0 : _a.id) || null,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });
    } catch (err) {
      const message = ((_c = (_b = err.response) == null ? void 0 : _b.data) == null ? void 0 : _c.error) || "Signup failed";
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw new Error(message);
    }
  },
  logout: async () => {
    try {
      const refreshToken = safeLocalStorage("refreshToken");
      await api.post("/auth/logout", { refreshToken });
    } catch {
    }
    clearSession();
    set({
      user: null,
      sessionId: null,
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      sessionBlocked: false,
      sessionBlockedMessage: null,
      accountInUse: null
    });
  },
  setOnboardingComplete: (complete) => {
    set({ hasCompletedOnboarding: complete });
  },
  checkAuth: async () => {
    var _a, _b, _c, _d;
    const token = safeLocalStorage("token");
    if (!token) return set({ isLoading: false, isAuthenticated: false });
    try {
      const { data } = await api.get("/auth/me");
      set({
        user: data.user,
        sessionId: data.sessionId || safeLocalStorage("sessionId"),
        isAuthenticated: true,
        isLoading: false,
        sessionBlocked: false
      });
    } catch (err) {
      if (((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.code) === "SESSION_SUPERSEDED") {
        handleSessionSuperseded((_d = (_c = err.response) == null ? void 0 : _c.data) == null ? void 0 : _d.error);
        return;
      }
      clearSession();
      set({ isLoading: false, isAuthenticated: false });
    }
  }
}));
const useSubscriptionStore = create((set, get) => ({
  userPlan: null,
  plans: [],
  recommendation: null,
  onboardingComplete: false,
  onboardingChecked: false,
  isLoading: false,
  fetchPlans: async () => {
    try {
      const { data } = await api.get("/subscriptions/plans");
      set({ plans: data.plans });
    } catch (err) {
      console.error("Failed to fetch plans:", err);
    }
  },
  getUserPlan: async () => {
    try {
      const { data } = await api.get("/subscriptions/my-plan");
      set({ userPlan: data.plan });
    } catch (err) {
      console.error("Failed to fetch user plan:", err);
    }
  },
  checkOnboarded: async () => {
    try {
      const { data } = await api.get("/subscriptions/onboarded");
      const onboarded = !!data.onboarded;
      useAuthStore.getState().setOnboardingComplete(onboarded);
      set({ onboardingComplete: onboarded, onboardingChecked: true });
      return onboarded;
    } catch (err) {
      console.error("Failed to check onboarding status:", err);
      set({ onboardingChecked: true });
      return false;
    }
  },
  getRecommendation: async (careerGoal, experienceLevel, painPoints) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post("/subscriptions/recommend", {
        careerGoal,
        experienceLevel,
        painPoints
      });
      set({ recommendation: data.recommendation, isLoading: false });
      return data.recommendation;
    } catch (err) {
      console.error("Failed to get recommendation:", err);
      set({ isLoading: false });
      throw err;
    }
  },
  selectPlan: async (planId) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post("/subscriptions/select-plan", { planId });
      useAuthStore.getState().setOnboardingComplete(true);
      set({ userPlan: data.plan, onboardingComplete: true, onboardingChecked: true, isLoading: false });
      return data.plan;
    } catch (err) {
      console.error("Failed to select plan:", err);
      set({ isLoading: false });
      throw err;
    }
  },
  hasAccess: (toolName) => {
    const { userPlan } = get();
    if (!userPlan) return false;
    return userPlan.features && userPlan.features.includes(toolName);
  }
}));
function getInitialDarkMode() {
  if (!isBrowser) return false;
  const saved = safeLocalStorage("theme");
  if (saved) return saved === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function useDarkMode() {
  const [isDark, setIsDark] = useState(getInitialDarkMode);
  useEffect(() => {
    if (!isBrowser) return;
    if (isDark) {
      document.documentElement.classList.add("dark");
      setSafeLocalStorage("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      setSafeLocalStorage("theme", "light");
    }
  }, [isDark]);
  return [isDark, setIsDark];
}
const BASE_NAV_GROUPS = [
  { label: "Job Search", items: [
    { label: "Job Discovery", path: "/discover", desc: "Find new opportunities" },
    { label: "Job Tracker", path: "/jobs", desc: "Track applications" },
    { label: "Job Matcher", path: "/jobmatch", desc: "Find matching roles" }
  ] },
  { label: "Job Tools", items: [
    { label: "Job Analyzer", path: "/job-analyzer", desc: "Extract skills from postings" },
    { label: "ATS Checker", path: "/ats-checker", desc: "Resume-job match score" },
    { label: "Job Fit Scorer", path: "/job-fit", desc: "Detailed job fit analysis" },
    { label: "Cover Letter", path: "/cover-letter", desc: "AI-generated letters" }
  ] },
  { label: "Portfolios", items: [
    { label: "GitHub Profile", path: "/github", desc: "Audit & generate README" },
    { label: "LinkedIn Profile", path: "/linkedin", desc: "Score your LinkedIn presence" }
  ] }
];
const PREP_ITEM_LOCKED = [
  { label: "Preparation Dashboard", path: "/preparation", desc: "Your central prep center" }
];
const PREP_ITEMS_UNLOCKED = [
  { label: "Preparation Dashboard", path: "/preparation", desc: "Your central prep center" },
  { label: "Tune & Polish", path: "/preparation/tune-and-polish", desc: "Interview Copilot & Resumes" },
  { label: "Zero to Hero", path: "/preparation/zero-to-hero", desc: "Path Finder & AI Tutor" },
  { label: "Learn & Build", path: "/preparation/learn-and-build", desc: "Targeted Portfolio Projects" }
];
const Navbar = () => {
  const { user, logout, isAuthenticated, checkAuth } = useAuthStore();
  const { userPlan } = useSubscriptionStore();
  const [isDark, setIsDark] = useDarkMode();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [openMobileGroup, setOpenMobileGroup] = useState(null);
  const [prepUnlocked, setPrepUnlocked] = useState(false);
  const dropdownRef = useRef(null);
  useEffect(() => {
    checkAuth();
  }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    api.get("/progress/preferences").then(({ data }) => {
      var _a;
      if ((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.prepOnboardingDone) setPrepUnlocked(true);
    }).catch(() => {
    });
  }, [isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) return;
    const recheck = () => {
      api.get("/progress/preferences").then(({ data }) => {
        var _a;
        if ((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.prepOnboardingDone) setPrepUnlocked(true);
      }).catch(() => {
      });
    };
    if (!prepUnlocked) recheck();
    window.addEventListener("prep-onboarding-complete", recheck);
    const relock = () => setPrepUnlocked(false);
    window.addEventListener("prep-onboarding-reset", relock);
    return () => {
      window.removeEventListener("prep-onboarding-complete", recheck);
      window.removeEventListener("prep-onboarding-reset", relock);
    };
  }, [location.pathname, isAuthenticated, prepUnlocked]);
  const NAV_GROUPS = [
    ...BASE_NAV_GROUPS,
    {
      label: "Preparation",
      items: prepUnlocked ? PREP_ITEMS_UNLOCKED : PREP_ITEM_LOCKED
    }
  ];
  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
  }, [location.pathname]);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenGroup(null);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);
  const isGroupActive = (group) => group.items.some((item) => location.pathname.startsWith(item.path));
  return /* @__PURE__ */ jsxs("header", { className: "fixed top-0 w-full z-50 glass-panel border-b border-white/40 dark:border-slate-800/50", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center px-6 lg:px-10 h-16 w-full gap-4", children: [
      /* @__PURE__ */ jsx(Link, { to: "/", className: "text-2xl font-black tracking-tight text-blue-800 font-headline flex-shrink-0 mr-2", children: "JobTune" }),
      /* @__PURE__ */ jsxs("nav", { className: "hidden lg:flex items-center gap-5 flex-1 justify-center min-w-0", ref: dropdownRef, children: [
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/dashboard",
            className: `text-sm font-semibold transition-all duration-200 ${location.pathname === "/dashboard" ? "text-blue-700 border-b-2 border-blue-600 pb-0.5" : "text-slate-500 hover:text-blue-600"}`,
            children: "Dashboard"
          }
        ),
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/resume",
            className: `text-sm font-semibold transition-all duration-200 ${location.pathname.startsWith("/resume") ? "text-blue-700 border-b-2 border-blue-600 pb-0.5" : "text-slate-500 hover:text-blue-600"}`,
            children: "Resume Forge"
          }
        ),
        /* @__PURE__ */ jsx(
          Link,
          {
            to: "/blog",
            className: `text-sm font-semibold transition-all duration-200 ${location.pathname === "/blog" ? "text-blue-700 border-b-2 border-blue-600 pb-0.5" : "text-slate-500 hover:text-blue-600"}`,
            children: "Blog"
          }
        ),
        NAV_GROUPS.map((group) => {
          const active = isGroupActive(group);
          const isOpen = openGroup === group.label;
          return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setOpenGroup(isOpen ? null : group.label),
                className: `flex items-center gap-1 text-sm font-semibold transition-colors duration-200 ${active || isOpen ? "text-blue-700" : "text-slate-500 hover:text-blue-600"}`,
                children: [
                  group.label,
                  /* @__PURE__ */ jsx(ChevronDown, { className: `w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}` })
                ]
              }
            ),
            isOpen && /* @__PURE__ */ jsx("div", { className: "absolute top-full left-0 mt-6 w-64 bg-white rounded-2xl shadow-[0px_16px_40px_rgba(0,78,159,0.12)] border border-slate-100 py-2 z-50", children: group.items.map((item) => /* @__PURE__ */ jsxs(
              Link,
              {
                to: item.path,
                className: "flex flex-col px-4 py-3 hover:bg-blue-50 transition-colors group rounded-xl mx-2",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-slate-800 group-hover:text-blue-700", children: item.label }),
                  /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400 mt-0.5", children: item.desc })
                ]
              },
              item.path
            )) })
          ] }, group.label);
        })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-shrink-0 ml-2", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setIsDark(!isDark),
            title: isDark ? "Light mode" : "Dark mode",
            className: "p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
            children: isDark ? /* @__PURE__ */ jsx(Sun, { className: "w-5 h-5" }) : /* @__PURE__ */ jsx(Moon, { className: "w-5 h-5" })
          }
        ),
        /* @__PURE__ */ jsx("span", { className: "hidden xl:block text-sm text-slate-500 dark:text-slate-400 font-medium hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors", children: "Support" }),
        /* @__PURE__ */ jsx("div", { className: "hidden md:flex items-center gap-2 border-l pl-3 border-slate-200 dark:border-slate-700", children: isAuthenticated ? /* @__PURE__ */ jsxs(Fragment, { children: [
          userPlan && /* @__PURE__ */ jsxs(
            Link,
            {
              to: "/dashboard/settings/plans",
              className: "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors group",
              title: "Manage or switch your plan",
              children: [
                /* @__PURE__ */ jsx(Crown, { className: "w-4 h-4 text-blue-600 dark:text-blue-400" }),
                /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-blue-700 dark:text-blue-300 hidden sm:inline group-hover:underline", children: userPlan.name })
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: logout,
              title: "Logout",
              className: "flex items-center gap-2 text-sm text-slate-500 hover:text-rose-600 font-medium transition-colors px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20",
              children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "logout" }),
                /* @__PURE__ */ jsx("span", { className: "hidden lg:inline", children: "Sign Out" })
              ]
            }
          ),
          /* @__PURE__ */ jsx("div", { className: "h-9 w-9 rounded-full bg-blue-100 overflow-hidden border-2 border-blue-200 shrink-0", children: /* @__PURE__ */ jsx("img", { alt: "User avatar", className: "w-full h-full object-cover", src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${(user == null ? void 0 : user.id) || "42"}` }) })
        ] }) : /* @__PURE__ */ jsx(
          Link,
          {
            to: "/login",
            className: "px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm",
            children: "Sign In"
          }
        ) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setMobileOpen((prev) => !prev),
            className: "lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors",
            "aria-label": "Toggle menu",
            children: mobileOpen ? /* @__PURE__ */ jsx(X, { className: "w-6 h-6" }) : /* @__PURE__ */ jsx(Menu, { className: "w-6 h-6" })
          }
        )
      ] })
    ] }),
    mobileOpen && /* @__PURE__ */ jsx("div", { className: "lg:hidden bg-white border-t border-slate-100 shadow-lg max-h-[80vh] overflow-y-auto", children: /* @__PURE__ */ jsxs("nav", { className: "flex flex-col px-6 py-4 gap-2 w-full", children: [
      /* @__PURE__ */ jsx(
        Link,
        {
          to: "/dashboard",
          className: `py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${location.pathname === "/dashboard" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-blue-600"}`,
          children: "Dashboard"
        }
      ),
      /* @__PURE__ */ jsx(
        Link,
        {
          to: "/resume",
          className: `py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${location.pathname.startsWith("/resume") ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-blue-600"}`,
          children: "Resume Forge"
        }
      ),
      /* @__PURE__ */ jsx(
        Link,
        {
          to: "/blog",
          className: `py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${location.pathname === "/blog" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-blue-600"}`,
          children: "Blog"
        }
      ),
      NAV_GROUPS.map((group) => {
        const isOpen = openMobileGroup === group.label;
        return /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setOpenMobileGroup(isOpen ? null : group.label),
              className: "flex items-center justify-between py-3 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors",
              children: [
                group.label,
                /* @__PURE__ */ jsx(ChevronDown, { className: `w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}` })
              ]
            }
          ),
          isOpen && /* @__PURE__ */ jsx("div", { className: "flex flex-col pl-4 border-l-2 border-slate-100 ml-6 mt-1 gap-1", children: group.items.map((item) => /* @__PURE__ */ jsx(
            Link,
            {
              to: item.path,
              className: `py-2 px-4 rounded-lg text-sm transition-colors ${location.pathname === item.path ? "text-blue-700 font-semibold bg-blue-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`,
              children: item.label
            },
            item.path
          )) })
        ] }, group.label);
      }),
      /* @__PURE__ */ jsxs("div", { className: "border-t border-slate-100 mt-2 pt-3 flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm text-slate-500 font-medium", children: "Support" }),
        isAuthenticated ? /* @__PURE__ */ jsx(
          "button",
          {
            onClick: logout,
            className: "flex items-center gap-2 text-sm text-rose-600 font-semibold px-4 py-2 rounded-lg bg-rose-50",
            children: "Sign Out"
          }
        ) : /* @__PURE__ */ jsx(Link, { to: "/login", className: "px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold", children: "Sign In" })
      ] })
    ] }) })
  ] });
};
const Layout = () => {
  const location = useLocation();
  location.pathname !== "/";
  const isFullScreenPage = location.pathname === "/onboarding" || location.pathname === "/payment-confirm";
  if (isFullScreenPage) {
    return /* @__PURE__ */ jsx(Outlet, {});
  }
  return /* @__PURE__ */ jsxs("div", { className: `min-h-screen flex flex-col font-body bg-slate-50 dark:bg-[#030712] text-slate-900 dark:text-slate-100 antialiased overflow-x-hidden relative transition-colors duration-500`, children: [
    /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 z-0 overflow-hidden pointer-events-none", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-400/30 mix-blend-multiply filter blur-[120px] opacity-70 animate-blob dark:bg-blue-900/40 dark:mix-blend-screen" }),
      /* @__PURE__ */ jsx("div", { className: "absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-400/30 mix-blend-multiply filter blur-[120px] opacity-70 animate-blob dark:bg-indigo-900/40 dark:mix-blend-screen", style: { animationDelay: "3s" } }),
      /* @__PURE__ */ jsx("div", { className: "absolute bottom-[-20%] left-[20%] w-[60%] h-[60%] rounded-full bg-cyan-400/30 mix-blend-multiply filter blur-[120px] opacity-70 animate-blob dark:bg-cyan-900/40 dark:mix-blend-screen", style: { animationDelay: "6s" } })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relative z-10 w-full flex flex-col flex-grow", children: [
      /* @__PURE__ */ jsx(Navbar, {}),
      /* @__PURE__ */ jsx("div", { className: "flex-grow flex pt-20", children: /* @__PURE__ */ jsx(Outlet, {}) }),
      /* @__PURE__ */ jsxs("footer", { className: "w-full border-t-0 bg-transparent flex justify-between items-center px-8 py-12 font-body text-sm relative z-10", children: [
        /* @__PURE__ */ jsx("div", { className: "text-slate-500 dark:text-slate-400", children: "© 2024 JobTune AI. Professional Vanguard System." }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-8", children: [
          /* @__PURE__ */ jsx("a", { className: "text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300", href: "#", children: "Privacy Policy" }),
          /* @__PURE__ */ jsx("a", { className: "text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300", href: "#", children: "Terms of Service" }),
          /* @__PURE__ */ jsx("a", { className: "text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300", href: "#", children: "Help Center" }),
          /* @__PURE__ */ jsx("a", { className: "text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300", href: "#", children: "API" })
        ] })
      ] })
    ] })
  ] });
};
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    __publicField(this, "reset", () => {
      this.setState({ hasError: false, error: null });
    });
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Error caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6", children: /* @__PURE__ */ jsx(AlertTriangle, { className: "w-8 h-8 text-red-600" }) }),
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-black text-slate-900 mb-2", children: "Something went wrong" }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-600 mb-6", children: "We encountered an unexpected error. Please try again or contact support." }),
        process.env.NODE_ENV === "development" && this.state.error && /* @__PURE__ */ jsx("div", { className: "mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-left text-xs text-red-700 font-mono overflow-auto max-h-32", children: this.state.error.toString() }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: this.reset,
              className: "flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors",
              children: [
                /* @__PURE__ */ jsx(RotateCcw, { className: "w-4 h-4" }),
                " Try Again"
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            "a",
            {
              href: "/",
              className: "flex-1 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors",
              children: "Go Home"
            }
          )
        ] })
      ] }) });
    }
    return this.props.children;
  }
}
const TOOL_ACCESS = {
  // Learn & Build tier (₹199/month)
  "Skill Assessment": "Learn & Build",
  "Career Roadmap": "Learn & Build",
  "Learning Hub": "Learn & Build",
  "Project Builder": "Learn & Build",
  "Portfolio Builder": "Learn & Build",
  // Tune & Polish tier (₹299/month) — includes everything above, plus:
  "Resume Optimizer": "Tune & Polish",
  "ATS Checker": "Tune & Polish",
  "LinkedIn Optimizer": "Tune & Polish",
  "GitHub Optimizer": "Tune & Polish",
  "Recruiter Visibility Checker": "Tune & Polish",
  "Resume Consistency Checker": "Tune & Polish",
  "Achievement Enhancer": "Tune & Polish",
  "Application Assistant": "Tune & Polish",
  // Zero To Hero tier (₹499/month) — includes everything above, plus:
  "Interview Prep": "Zero to Hero",
  "Job Analytics": "Zero to Hero",
  "Career Readiness Dashboard": "Zero to Hero",
  // Tools not explicitly named in the pricing PDF — kept at their closest
  // existing tier so they remain reachable rather than orphaned.
  "Job Discovery": "Tune & Polish",
  "Job Tracker": "Zero to Hero",
  "Job Fit Analysis": "Zero to Hero",
  "Evidence Dashboard": "Zero to Hero",
  "Job Analyzer": "Zero to Hero"
};
const ROUTE_TOOLS = {
  "/skills": "Skill Assessment",
  "/career": "Career Roadmap",
  "/learning": "Learning Hub",
  "/projects": "Project Builder",
  "/portfolio": "Portfolio Builder",
  "/resume": "Resume Optimizer",
  "/resume/build": "Resume Optimizer",
  "/resume/history": "Resume Optimizer",
  "/resume/compare": "Resume Optimizer",
  "/resume/send": "Resume Optimizer",
  "/ats-checker": "ATS Checker",
  "/linkedin": "LinkedIn Optimizer",
  "/github": "GitHub Optimizer",
  "/recruiter-visibility": "Recruiter Visibility Checker",
  "/resume-consistency": "Resume Consistency Checker",
  "/achievement-enhancer": "Achievement Enhancer",
  "/application-assistant": "Application Assistant",
  "/cover-letter": "Application Assistant",
  "/interview": "Interview Prep",
  "/job-analytics": "Job Analytics",
  "/career-readiness": "Career Readiness Dashboard",
  "/jobmatch": "Job Discovery",
  "/discover": "Job Discovery",
  "/jobs": "Job Tracker",
  "/preparation": "Learning Hub",
  "/preparation/zero-to-hero": "Learning Hub",
  "/preparation/tune-and-polish": "Learning Hub",
  "/preparation/learn-and-build": "Learning Hub",
  "/evidence": "Evidence Dashboard",
  "/job-fit": "Job Fit Analysis",
  "/job-analyzer": "Job Analyzer"
};
const PLAN_TIERS$1 = {
  "Learn & Build": 1,
  "Tune & Polish": 2,
  "Zero to Hero": 3
};
function getToolForRoute(path) {
  return ROUTE_TOOLS[path] || null;
}
function getRequiredPlan(toolName) {
  return TOOL_ACCESS[toolName] || "Learn & Build";
}
const PLAN_META = {
  "Learn & Build": {
    tier: 1,
    icon: Zap,
    color: "blue",
    description: "Build the skills, projects, and portfolio needed for your dream career.",
    tagline: "Build the skills, projects, and portfolio for your dream career.",
    bestFor: "Students & beginners starting their career journey",
    outcome: "Go from no skills to a strong, project-backed portfolio."
  },
  "Tune & Polish": {
    tier: 2,
    icon: TrendingUp,
    color: "purple",
    description: "Turn your existing skills into a recruiter-ready professional profile.",
    tagline: "Turn your skills into a recruiter-ready professional profile.",
    bestFor: "Job seekers ready to optimize their applications",
    outcome: "Go from raw skills to a polished, recruiter-ready profile."
  },
  "Zero to Hero": {
    tier: 3,
    icon: Crown,
    color: "amber",
    description: "The complete career transformation ecosystem.",
    tagline: "The complete career transformation ecosystem.",
    bestFor: "Serious candidates who want the full advantage",
    outcome: "Go from zero to fully job-ready, interview-confident, and hired."
  }
};
function getPlanTier(planName) {
  var _a;
  return ((_a = PLAN_META[planName]) == null ? void 0 : _a.tier) || 0;
}
function getChangeType(currentPlanName, targetPlanName) {
  const currentTier = getPlanTier(currentPlanName);
  const targetTier = getPlanTier(targetPlanName);
  if (targetTier > currentTier) return "upgrade";
  if (targetTier < currentTier) return "downgrade";
  return "same";
}
function getFeatureDiff(currentFeatures = [], nextFeatures = []) {
  const current = new Set(currentFeatures);
  const next = new Set(nextFeatures);
  return {
    gained: [...next].filter((feature) => !current.has(feature)),
    lost: [...current].filter((feature) => !next.has(feature))
  };
}
function formatPrice(price) {
  if (price === 0 || price === "0") return "Free";
  return `₹${price}/mo`;
}
const PLAN_COLORS = {
  "Learn & Build": { icon: Zap, color: "blue", label: "Entry Plan" },
  "Tune & Polish": { icon: TrendingUp, color: "purple", label: "Mid Plan" },
  "Zero to Hero": { icon: Crown, color: "amber", label: "Premium Plan" }
};
function PlanGate({ toolName, requiredPlan = "Tune & Polish", children, fallback = null }) {
  var _a;
  const { userPlan, onboardingComplete } = useSubscriptionStore();
  if (!onboardingComplete) {
    return fallback || /* @__PURE__ */ jsx("div", { className: "w-full h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "animate-spin mb-4", children: /* @__PURE__ */ jsx(Zap, { className: "w-8 h-8 text-blue-600 dark:text-blue-400" }) }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-400 font-medium", children: "Setting up your plan..." })
    ] }) });
  }
  const userTier = userPlan ? PLAN_TIERS$1[userPlan.name] || 0 : 0;
  const requiredTier = PLAN_TIERS$1[requiredPlan] || PLAN_TIERS$1[TOOL_ACCESS[toolName]] || 1;
  const hasAccess = userTier >= requiredTier;
  if (hasAccess) {
    return children;
  }
  const planConfig = PLAN_COLORS[requiredPlan] || PLAN_COLORS["Tune & Polish"];
  const IconComponent = planConfig.icon;
  return /* @__PURE__ */ jsx("div", { className: "w-full min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full text-center", children: [
    /* @__PURE__ */ jsx("div", { className: `inline-flex items-center justify-center w-20 h-20 rounded-full bg-${planConfig.color}-100 dark:bg-${planConfig.color}-900/30 mb-6`, children: /* @__PURE__ */ jsx(Lock, { className: `w-10 h-10 text-${planConfig.color}-600 dark:text-${planConfig.color}-400` }) }),
    /* @__PURE__ */ jsxs("h1", { className: "text-3xl font-black text-slate-900 dark:text-white mb-3", children: [
      toolName,
      " Locked"
    ] }),
    /* @__PURE__ */ jsxs("p", { className: "text-slate-600 dark:text-slate-400 mb-8", children: [
      "This tool is only available in the ",
      /* @__PURE__ */ jsx("span", { className: "font-bold text-slate-900 dark:text-white", children: requiredPlan }),
      " plan or higher."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white dark:bg-slate-800 rounded-xl p-6 mb-8", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400 mb-4", children: "Your current plan:" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx(IconComponent, { className: "w-6 h-6 text-slate-400" }),
        /* @__PURE__ */ jsx("span", { className: "text-xl font-bold text-slate-900 dark:text-white", children: (userPlan == null ? void 0 : userPlan.name) || "Unknown" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-6 text-left", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-wider text-slate-400 mb-2", children: "Upgrade to unlock" }),
      /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 dark:text-white", children: requiredPlan }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: (_a = PLAN_META[requiredPlan]) == null ? void 0 : _a.tagline })
    ] }),
    /* @__PURE__ */ jsxs(
      Link,
      {
        to: "/dashboard/settings/plans",
        state: { highlightPlan: requiredPlan, fromTool: toolName },
        className: "w-full py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all mb-3 flex items-center justify-center gap-2",
        children: [
          "View plans & upgrade",
          /* @__PURE__ */ jsx(ArrowRight, { className: "w-4 h-4" })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => window.history.back(),
        className: "w-full py-3 px-6 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all",
        children: "Go back"
      }
    )
  ] }) });
}
const TOOLS = [
  { name: "Skill Assessment", icon: Activity, path: "/skills", accent: "#3b82f6", light: "#eff6ff", tag: "Foundation" },
  { name: "Resume Forge", icon: FileText, path: "/resume", accent: "#10b981", light: "#f0fdf4", tag: "Resumes" },
  { name: "LinkedIn Optimizer", icon: Linkedin, path: "/linkedin", accent: "#0ea5e9", light: "#f0f9ff", tag: "Profile" },
  { name: "GitHub Optimizer", icon: Github, path: "/github", accent: "#6366f1", light: "#eef2ff", tag: "Profile" },
  { name: "Portfolio Builder", icon: Layout$1, path: "/portfolio", accent: "#8b5cf6", light: "#f5f3ff", tag: "Profile" },
  { name: "Content Vault", icon: BookOpen, path: "/learning", accent: "#f59e0b", light: "#fffbeb", tag: "Growth" },
  { name: "Project Ideas", icon: Lightbulb, path: "/projects", accent: "#ef4444", light: "#fef2f2", tag: "Growth" }
];
const STEPS$2 = [
  { num: "01", title: "Assess", desc: "A 45-min diagnostic maps your exact technical standing across 25+ domains." },
  { num: "02", title: "Optimize", desc: "AI rewrites your resume, LinkedIn headline, and GitHub profile for recruiters." },
  { num: "03", title: "Learn", desc: "A personalized path fills every gap the assessment found — nothing extra." },
  { num: "04", title: "Build", desc: "Ship real projects using guided templates and host them with one click." }
];
function SectionBadge({ children }) {
  return /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold tracking-widest uppercase", children });
}
function DarkBadge({ children }) {
  return /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/8 border border-white/10 text-blue-300 text-xs font-bold tracking-widest uppercase", children });
}
function useCounter(target, duration = 1500) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
          start = Math.min(start + step, target);
          setCount(Math.floor(start));
          if (start >= target) clearInterval(timer);
        }, 16);
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);
  return [count, ref];
}
function StatCounter({ value, suffix = "", label }) {
  const [count, ref] = useCounter(value);
  return /* @__PURE__ */ jsxs("div", { ref, className: "text-center", children: [
    /* @__PURE__ */ jsxs("p", { className: "text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter", children: [
      count.toLocaleString(),
      suffix
    ] }),
    /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-sm font-medium mt-1", children: label })
  ] });
}
function AssessmentVisual() {
  const skills = [
    { label: "React.js", pct: 82, color: "#3b82f6" },
    { label: "System Design", pct: 54, color: "#f59e0b" },
    { label: "Databases", pct: 68, color: "#10b981" },
    { label: "Behavioral", pct: 91, color: "#8b5cf6" }
  ];
  return /* @__PURE__ */ jsxs("div", { className: "bg-slate-900/80 rounded-2xl p-6 space-y-4 shadow-glass backdrop-blur-md border border-white/10", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-slate-500 uppercase tracking-widest", children: "Skill Radar" }),
      /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full", children: "Score: 73 / 100" })
    ] }),
    skills.map((s) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-xs mb-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-medium", children: s.label }),
        /* @__PURE__ */ jsxs("span", { className: "text-slate-600", children: [
          s.pct,
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "w-full h-1.5 bg-white/5 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx(
        "div",
        {
          className: "h-full rounded-full",
          style: { width: `${s.pct}%`, background: s.color }
        }
      ) })
    ] }, s.label)),
    /* @__PURE__ */ jsxs("div", { className: "pt-3 border-t border-white/5 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx("div", { className: "w-1.5 h-1.5 rounded-full bg-amber-400" }),
      /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-slate-500", children: [
        "Gap detected: ",
        /* @__PURE__ */ jsx("span", { className: "text-amber-400 font-semibold", children: "System Design" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "bg-blue-500/8 rounded-xl p-3 border border-blue-500/15", children: /* @__PURE__ */ jsx("p", { className: "text-[11px] text-blue-300 font-medium", children: "✦ Suggested path: System Design for SDE-1" }) })
  ] });
}
function ResumeVisual() {
  return /* @__PURE__ */ jsxs("div", { className: "bg-slate-900/80 rounded-2xl p-6 border border-white/10 shadow-glass backdrop-blur-md space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative w-16 h-16 shrink-0", children: [
        /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 36 36", className: "w-full h-full -rotate-90", children: [
          /* @__PURE__ */ jsx("circle", { cx: "18", cy: "18", r: "15.9", fill: "none", stroke: "#1e293b", strokeWidth: "3.2" }),
          /* @__PURE__ */ jsx(
            "circle",
            {
              cx: "18",
              cy: "18",
              r: "15.9",
              fill: "none",
              stroke: "#3b82f6",
              strokeWidth: "3.2",
              strokeDasharray: "85 100",
              strokeLinecap: "round"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsx("span", { className: "text-lg font-black text-white", children: "85" }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-white font-bold", children: "ATS Score" }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-xs mt-0.5", children: "Better than 78% of applicants" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-1", children: [
      { label: "Keyword match", status: "Strong", ok: true },
      { label: "Impact verbs", status: "Weak", ok: false },
      { label: "Quantified wins", status: "Missing", ok: false },
      { label: "Format check", status: "Pass", ok: true }
    ].map((r) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between py-2 border-b border-white/5", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: r.label }),
      /* @__PURE__ */ jsx("span", { className: `text-[11px] font-bold px-2 py-0.5 rounded-full ${r.ok ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"}`, children: r.status })
    ] }, r.label)) })
  ] });
}
function VaultVisual() {
  const items = [
    { title: "React Patterns Deep Dive", type: "Video", dur: "12h", c: "#3b82f6" },
    { title: "System Design Crash Course", type: "Course", dur: "6h", c: "#8b5cf6" },
    { title: "Advanced SQL & Indexing", type: "Interactive", dur: "2h", c: "#10b981" },
    { title: "Behavioral Interview Guide", type: "PDF", dur: "1h", c: "#f59e0b" }
  ];
  return /* @__PURE__ */ jsxs("div", { className: "bg-slate-900/80 rounded-2xl p-6 border border-white/10 shadow-glass backdrop-blur-md space-y-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-slate-500 uppercase tracking-widest", children: "For you" }),
      /* @__PURE__ */ jsx("span", { className: "text-[11px] text-blue-400 font-semibold", children: "4 new" })
    ] }),
    items.map((it) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-white/3 hover:bg-white/6 transition-colors cursor-pointer group", children: [
      /* @__PURE__ */ jsx("div", { className: "w-9 h-9 rounded-lg flex items-center justify-center shrink-0", style: { background: it.c + "18" }, children: /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded", style: { background: it.c } }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-grow min-w-0", children: [
        /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-white truncate", children: it.title }),
        /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-slate-500", children: [
          it.type,
          " · ",
          it.dur
        ] })
      ] }),
      /* @__PURE__ */ jsx(ChevronRight, { className: "w-4 h-4 text-slate-700 group-hover:text-slate-400 shrink-0 transition-colors" })
    ] }, it.title))
  ] });
}
const FEATURES = [
  {
    badge: "Step 1 — Skill Assessment",
    title: "Know your blind spots\nbefore recruiters find them.",
    desc: "Our assessment covers 25+ domains: React, System Design, SQL, DevOps, and even behavioral questions. You walk out with a ranked breakdown and a personal learning path — not just a number.",
    cta: "Take the Assessment",
    path: "/skills",
    Visual: AssessmentVisual
  },
  {
    badge: "Step 2 — Resume Forge",
    title: "Get past every ATS\nfilter, every time.",
    desc: "Upload once. Get a full ATS compatibility score, keyword gap analysis, and rewritten bullet points with quantified impact — all in seconds. Most users improve their score by 20+ points.",
    cta: "Forge My Resume",
    path: "/resume",
    Visual: ResumeVisual
  },
  {
    badge: "Step 3 — Content Vault",
    title: "Learn exactly what\nthe market is hiring for.",
    desc: "1,000+ hand-picked resources mapped directly to your skill gaps. No random Udemy rabbit holes — just the specific content that closes the specific gaps your assessment found.",
    cta: "Enter the Vault",
    path: "/learning",
    Visual: VaultVisual
  }
];
function Home() {
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col flex-grow w-full overflow-x-hidden", children: [
    /* @__PURE__ */ jsxs(
      "section",
      {
        className: "relative min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 overflow-hidden",
        style: {
          background: "transparent",
          backgroundImage: `
            linear-gradient(rgba(128,128,128,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(128,128,128,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px"
        },
        children: [
          /* @__PURE__ */ jsx("div", { className: "absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/15 blur-[140px] rounded-full pointer-events-none" }),
          /* @__PURE__ */ jsx("div", { className: "absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 blur-[140px] rounded-full pointer-events-none" }),
          /* @__PURE__ */ jsxs("div", { className: "relative z-10 max-w-4xl mx-auto space-y-8", children: [
            /* @__PURE__ */ jsxs(DarkBadge, { children: [
              /* @__PURE__ */ jsx(Sparkles, { className: "w-3 h-3" }),
              " The Complete Career OS for Freshers"
            ] }),
            /* @__PURE__ */ jsxs("h1", { className: "text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-slate-900 dark:text-white leading-[0.95] tracking-tighter drop-shadow-sm", children: [
              "Stop applying.",
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: "bg-clip-text text-transparent",
                  style: { backgroundImage: "linear-gradient(135deg, #60a5fa 0%, #818cf8 50%, #a78bfa 100%)" },
                  children: "Start getting hired."
                }
              )
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed font-light", children: "7 interconnected tools that take you from confused fresher to job-ready professional. Built for CS graduates. Free, forever." }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-4 justify-center pt-2", children: [
              /* @__PURE__ */ jsxs(
                Link,
                {
                  to: "/login",
                  className: "group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-500 transition-all duration-200 active:scale-95 shadow-[0_0_40px_rgba(37,99,235,0.35)]",
                  children: [
                    "Get Started — It's Free",
                    /* @__PURE__ */ jsx(ArrowRight, { className: "w-4 h-4 group-hover:translate-x-0.5 transition-transform" })
                  ]
                }
              ),
              /* @__PURE__ */ jsx(
                "a",
                {
                  href: "#how-it-works",
                  className: "inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-bold text-base hover:bg-white/10 transition-all duration-200 backdrop-blur-sm",
                  children: "See how it works"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-6 pt-4", children: [
              /* @__PURE__ */ jsx("div", { className: "flex -space-x-2.5", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ jsx("div", { className: "w-9 h-9 rounded-full border-2 border-[#030712] bg-slate-800 overflow-hidden", children: /* @__PURE__ */ jsx("img", { src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i * 7}`, alt: "" }) }, i)) }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("div", { className: "flex gap-0.5", children: [...Array(5)].map((_, i) => /* @__PURE__ */ jsx(Star, { className: "w-3.5 h-3.5 text-amber-400 fill-amber-400" }, i)) }),
                /* @__PURE__ */ jsxs("span", { className: "text-slate-600 dark:text-slate-400 text-sm", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-slate-900 dark:text-white font-bold", children: "50,000+" }),
                  " students improving"
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "absolute bottom-12 left-0 right-0 z-10 overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "flex justify-center gap-3 px-4 flex-wrap", children: TOOLS.map((t) => /* @__PURE__ */ jsxs(
            "div",
            {
              className: `flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-sm ${t.locked ? "bg-slate-200/50 dark:bg-white/2 border-slate-300 dark:border-white/4 grayscale" : "bg-slate-200/50 dark:bg-white/4 border-slate-300 dark:border-white/8"}`,
              title: t.locked ? "Under maintenance" : "",
              children: [
                t.locked ? /* @__PURE__ */ jsx(Lock, { className: "w-3.5 h-3.5 text-slate-400 dark:text-slate-600" }) : /* @__PURE__ */ jsx(t.icon, { className: "w-3.5 h-3.5", style: { color: t.accent } }),
                /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-700 dark:text-slate-400 font-medium whitespace-nowrap flex items-center gap-1", children: t.name })
              ]
            },
            t.name
          )) }) })
        ]
      }
    ),
    /* @__PURE__ */ jsx("section", { className: "glass-panel border-t border-white/20 border-b border-white/20 dark:border-white/5 relative z-10", children: /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto px-4 py-16 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-slate-300 dark:md:divide-white/10", children: [
      /* @__PURE__ */ jsx(StatCounter, { value: 5e4, suffix: "+", label: "Students enrolled" }),
      /* @__PURE__ */ jsx(StatCounter, { value: 87, suffix: "%", label: "Reported better interviews" }),
      /* @__PURE__ */ jsx(StatCounter, { value: 7, suffix: "", label: "Interconnected tools" }),
      /* @__PURE__ */ jsx(StatCounter, { value: 1e3, suffix: "+", label: "Curated resources" })
    ] }) }),
    FEATURES.map((f, idx) => {
      const isEven = idx % 2 === 0;
      return /* @__PURE__ */ jsx("section", { className: "relative z-10", children: /* @__PURE__ */ jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32", children: /* @__PURE__ */ jsxs("div", { className: `grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${!isEven ? "lg:grid-flow-dense" : ""}`, children: [
        /* @__PURE__ */ jsxs("div", { className: `space-y-6 ${!isEven ? "lg:col-start-2" : ""}`, children: [
          /* @__PURE__ */ jsx(SectionBadge, { children: f.badge }),
          /* @__PURE__ */ jsx("h2", { className: "text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight whitespace-pre-line", children: f.title }),
          /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-500 leading-relaxed", children: f.desc }),
          /* @__PURE__ */ jsxs(
            Link,
            {
              to: f.path,
              className: "inline-flex items-center gap-2 text-blue-600 font-bold text-sm hover:gap-3 transition-all group",
              children: [
                f.cta,
                /* @__PURE__ */ jsx(ArrowRight, { className: "w-4 h-4 group-hover:translate-x-0.5 transition-transform" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: `${!isEven ? "lg:col-start-1 lg:row-start-1" : ""}`, children: /* @__PURE__ */ jsxs("div", { className: "rounded-2xl overflow-hidden glass-card border border-white/30 dark:border-white/10", children: [
          /* @__PURE__ */ jsxs("div", { className: "bg-slate-200/50 dark:bg-slate-800/50 px-4 py-3 flex items-center gap-2 border-b border-white/20 dark:border-white/5", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex gap-1.5", children: [
              /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded-full bg-rose-400/80" }),
              /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded-full bg-amber-400/80" }),
              /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded-full bg-emerald-400/80" })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "flex-grow h-5 bg-white/40 dark:bg-slate-700/50 rounded mx-8" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "p-4 bg-transparent", children: /* @__PURE__ */ jsx(f.Visual, {}) })
        ] }) })
      ] }) }) }, idx);
    }),
    /* @__PURE__ */ jsxs(
      "section",
      {
        id: "tools",
        className: "py-24 lg:py-32 relative overflow-hidden glass-panel border-y border-white/20 dark:border-white/5",
        children: [
          /* @__PURE__ */ jsx(
            "div",
            {
              className: "absolute inset-0",
              style: {
                backgroundImage: `radial-gradient(circle at 20% 50%, rgba(59,130,246,0.05) 0%, transparent 50%),
                              radial-gradient(circle at 80% 20%, rgba(139,92,246,0.05) 0%, transparent 50%)`
              }
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10", children: [
            /* @__PURE__ */ jsxs("div", { className: "text-center space-y-4 mb-16", children: [
              /* @__PURE__ */ jsx(DarkBadge, { children: "Every tool you need" }),
              /* @__PURE__ */ jsx("h2", { className: "text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm", children: "The complete 7-tool ecosystem" }),
              /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-lg max-w-xl mx-auto", children: "Each tool feeds into the next. Your skill gaps inform your resume. Your resume score shapes your LinkedIn. It all connects." })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: TOOLS.map((tool, i) => {
              const Icon = tool.icon;
              const isFeatured = i === 0 || i === 5;
              return tool.locked ? /* @__PURE__ */ jsxs(
                "div",
                {
                  className: `relative p-6 rounded-2xl border border-white/8 bg-white/3 opacity-50 cursor-not-allowed flex flex-col gap-4 overflow-hidden ${isFeatured ? "sm:col-span-2 lg:col-span-1" : ""}`,
                  children: [
                    /* @__PURE__ */ jsxs("div", { className: "relative z-10 flex items-start justify-between", children: [
                      /* @__PURE__ */ jsx("div", { className: "w-11 h-11 rounded-xl flex items-center justify-center bg-slate-800", children: /* @__PURE__ */ jsx(Lock, { className: "w-5 h-5 text-slate-600" }) }),
                      /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-black uppercase tracking-widest text-slate-600 border border-white/8 px-2 py-0.5 rounded-full flex items-center gap-1", children: [
                        tool.tag,
                        " ",
                        /* @__PURE__ */ jsx(Lock, { className: "w-2.5 h-2.5" })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
                      /* @__PURE__ */ jsx("h3", { className: "text-base font-bold text-slate-500 mb-1", children: tool.name }),
                      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 dark:text-slate-400 leading-relaxed italic", children: "Temporarily unavailable while undergoing a massive AI upgrade." })
                    ] })
                  ]
                },
                tool.name
              ) : /* @__PURE__ */ jsxs(
                Link,
                {
                  to: tool.path,
                  className: `group relative p-6 rounded-2xl glass-button flex flex-col gap-4 overflow-hidden ${isFeatured ? "sm:col-span-2 lg:col-span-1" : ""}`,
                  children: [
                    /* @__PURE__ */ jsx(
                      "div",
                      {
                        className: "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl",
                        style: { background: `radial-gradient(circle at 0% 0%, ${tool.accent}10 0%, transparent 60%)` }
                      }
                    ),
                    /* @__PURE__ */ jsxs("div", { className: "relative z-10 flex items-start justify-between", children: [
                      /* @__PURE__ */ jsx(
                        "div",
                        {
                          className: "w-11 h-11 rounded-xl flex items-center justify-center",
                          style: { background: tool.accent + "18" },
                          children: /* @__PURE__ */ jsx(Icon, { className: "w-5 h-5", style: { color: tool.accent } })
                        }
                      ),
                      /* @__PURE__ */ jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-slate-600 border border-white/8 px-2 py-0.5 rounded-full", children: tool.tag })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
                      /* @__PURE__ */ jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-white mb-1", children: tool.name }),
                      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400 leading-relaxed", children: [
                        "Interactive quiz covering 25+ skills. Get a 360° view of your technical standing.",
                        "ATS-focused scoring and impact analysis. Upload any format.",
                        "Keyword strategy and headline scoring for executive-level visibility.",
                        "Automated profile README generation and repo health audit.",
                        "Build a high-conversion personal site with zero code required.",
                        "1,000+ curated resources mapped to your specific skill gaps.",
                        "Industry-standard project blueprints with step-by-step guides."
                      ][i] })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "relative z-10 flex items-center gap-1.5 text-xs font-bold mt-auto opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200", style: { color: tool.accent }, children: [
                      "Open tool ",
                      /* @__PURE__ */ jsx(ArrowRight, { className: "w-3.5 h-3.5" })
                    ] })
                  ]
                },
                tool.name
              );
            }) })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx("section", { id: "how-it-works", className: "relative z-10 py-24 lg:py-32", children: /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center space-y-4 mb-16", children: [
        /* @__PURE__ */ jsx(SectionBadge, { children: "The process" }),
        /* @__PURE__ */ jsx("h2", { className: "text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight", children: "From day one to offer letter" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8", children: [
        /* @__PURE__ */ jsx("div", { className: "hidden lg:block absolute top-10 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" }),
        STEPS$2.map((step, i) => /* @__PURE__ */ jsxs("div", { className: "relative flex flex-col items-center text-center group", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative mb-6", children: [
            /* @__PURE__ */ jsx("div", { className: "w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center group-hover:border-blue-200 dark:group-hover:border-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-all duration-300", children: /* @__PURE__ */ jsx("span", { className: "text-2xl font-black text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors", children: step.num }) }),
            i < STEPS$2.length - 1 && /* @__PURE__ */ jsx("div", { className: "lg:hidden absolute top-1/2 left-full w-8 h-px bg-slate-200 -translate-y-1/2" })
          ] }),
          /* @__PURE__ */ jsx("h3", { className: "text-xl font-black text-slate-900 dark:text-white mb-2", children: step.title }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-sm leading-relaxed max-w-[200px]", children: step.desc })
        ] }, i))
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("section", { className: "relative z-10 py-24 px-4 sm:px-6 lg:px-8", children: /* @__PURE__ */ jsx("div", { className: "max-w-4xl mx-auto", children: /* @__PURE__ */ jsxs(
      "div",
      {
        className: "rounded-3xl p-12 md:p-20 text-center relative overflow-hidden glass-card",
        children: [
          /* @__PURE__ */ jsx(
            "div",
            {
              className: "absolute inset-0 rounded-3xl opacity-30",
              style: {
                backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
                backgroundSize: "40px 40px"
              }
            }
          ),
          /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 w-80 h-80 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" }),
          /* @__PURE__ */ jsxs("div", { className: "relative z-10 space-y-6", children: [
            /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center gap-2 mb-2", children: [...Array(5)].map((_, i) => /* @__PURE__ */ jsx(CheckCircle2, { className: "w-4 h-4 text-emerald-400" }, i)) }),
            /* @__PURE__ */ jsxs("h2", { className: "text-3xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight", children: [
              "Your career doesn't wait.",
              /* @__PURE__ */ jsx("br", {}),
              /* @__PURE__ */ jsx("span", { className: "text-blue-600 dark:text-blue-300", children: "Neither should you." })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-400 text-lg max-w-lg mx-auto font-light leading-relaxed", children: "Join 50,000+ freshers who stopped guessing and started building a profile that actually gets interviews." }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-4 justify-center pt-2", children: [
              /* @__PURE__ */ jsxs(
                Link,
                {
                  to: "/login",
                  className: "group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white text-slate-900 rounded-xl font-black text-base hover:bg-blue-50 transition-all duration-200 active:scale-95 shadow-xl",
                  children: [
                    /* @__PURE__ */ jsx(Users, { className: "w-5 h-5 text-blue-600" }),
                    "Start for free",
                    /* @__PURE__ */ jsx(ArrowRight, { className: "w-4 h-4 group-hover:translate-x-0.5 transition-transform" })
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                Link,
                {
                  to: "/skills",
                  className: "inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-bold text-base hover:bg-white/10 transition-all duration-200",
                  children: [
                    /* @__PURE__ */ jsx(Zap, { className: "w-4 h-4 text-blue-400" }),
                    "Take the assessment first"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-slate-500 dark:text-slate-400 text-xs", children: "No credit card. No paywall. No BS." })
          ] })
        ]
      }
    ) }) })
  ] });
}
const QUESTIONS$1 = [
  {
    id: "career-goal",
    question: "What's your primary career goal?",
    type: "single",
    options: [
      { value: "service-role", label: "🔧 Service & Support Roles", desc: "Customer success, technical support, entry-level" },
      { value: "skill-development", label: "📚 Improve My Skills", desc: "Build expertise, get better at current role" },
      { value: "faang-or-top-company", label: "🚀 Land at Top Company", desc: "FAANG, unicorn, or premium tier company" }
    ]
  },
  {
    id: "experience",
    question: "What's your experience level?",
    type: "single",
    options: [
      { value: "beginner", label: "🌱 Beginner", desc: "0-1 year or career switcher" },
      { value: "intermediate", label: "📈 Intermediate", desc: "1-3 years in industry" },
      { value: "advanced", label: "⭐ Advanced", desc: "3+ years, looking to level up" }
    ]
  },
  {
    id: "pain-points",
    question: "What challenges are you facing? (Select all that apply)",
    type: "multiple",
    options: [
      { value: "resume-portfolio", label: "📄 Resume & Portfolio", desc: "Need help optimizing resume or GitHub" },
      { value: "interviews", label: "🎤 Interview Prep", desc: "Worried about technical or behavioral interviews" },
      { value: "job-search", label: "🔍 Job Search", desc: "Finding right opportunities, applying effectively" },
      { value: "skill-gaps", label: "🛠️ Skill Gaps", desc: "Missing key technical skills" },
      { value: "networking", label: "🤝 Networking", desc: "Building professional network, getting referrals" },
      { value: "project-building", label: "⚙️ Project Building", desc: "Need ideas for portfolio projects" }
    ]
  }
];
function OnboardingQuestionnaire({ onComplete }) {
  var _a;
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({
    "career-goal": null,
    "experience": null,
    "pain-points": []
  });
  const { getRecommendation, isLoading } = useSubscriptionStore();
  const currentQuestion = QUESTIONS$1 == null ? void 0 : QUESTIONS$1[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === ((QUESTIONS$1 == null ? void 0 : QUESTIONS$1.length) || 0) - 1;
  const answeredAll = answers["career-goal"] && answers["experience"] && ((_a = answers["pain-points"]) == null ? void 0 : _a.length) > 0;
  if (!currentQuestion) {
    return /* @__PURE__ */ jsx("div", { className: "text-center py-12", children: "Loading questions..." });
  }
  const handleAnswer = (value) => {
    if (currentQuestion.type === "single") {
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
      if (!isLastQuestion) {
        setTimeout(() => setCurrentQuestionIndex((prev) => prev + 1), 300);
      }
    } else {
      setAnswers((prev) => ({
        ...prev,
        "pain-points": prev["pain-points"].includes(value) ? prev["pain-points"].filter((v) => v !== value) : [...prev["pain-points"], value]
      }));
    }
  };
  const handleSubmit = async () => {
    if (!answers["career-goal"] || !answers["experience"] || answers["pain-points"].length === 0) {
      alert("Please answer all questions before continuing");
      return;
    }
    try {
      const result = await getRecommendation(
        answers["career-goal"],
        answers["experience"],
        answers["pain-points"]
      );
      if (result) {
        onComplete();
      } else {
        alert("Failed to get recommendation. Please try again.");
      }
    } catch (err) {
      console.error("Failed to get recommendation:", err);
      alert("Error: " + (err.message || "Failed to get recommendation"));
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "w-full h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-2xl max-h-[90vh] overflow-y-auto", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-3 mb-4", children: [
        /* @__PURE__ */ jsx(MessageCircle, { className: "w-8 h-8 text-blue-600 dark:text-blue-400" }),
        /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 dark:text-white", children: "Let's Get Started" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-600 dark:text-slate-400", children: "Answer a few questions to find your perfect plan" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-8", children: [
      /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: QUESTIONS$1.map((_, idx) => /* @__PURE__ */ jsx(
        "div",
        {
          className: `h-2 flex-1 rounded-full transition-all ${idx < currentQuestionIndex ? "bg-green-500" : idx === currentQuestionIndex ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`
        },
        idx
      )) }),
      /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-600 dark:text-slate-400 mt-2", children: [
        "Question ",
        currentQuestionIndex + 1,
        " of ",
        QUESTIONS$1.length
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white dark:bg-slate-800 rounded-2xl p-8 mb-8 shadow-lg", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-900 dark:text-white mb-6", children: currentQuestion.question }),
      /* @__PURE__ */ jsx("div", { className: "space-y-3", children: currentQuestion.options.map((option) => /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => handleAnswer(option.value),
          className: `w-full text-left p-4 rounded-xl border-2 transition-all ${currentQuestion.type === "single" ? answers[currentQuestion.id] === option.value ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30" : "border-slate-200 dark:border-slate-600 hover:border-blue-400" : answers["pain-points"].includes(option.value) ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30" : "border-slate-200 dark:border-slate-600 hover:border-blue-400"}`,
          children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
            /* @__PURE__ */ jsx("div", { className: `w-5 h-5 rounded border-2 mt-1 flex items-center justify-center flex-shrink-0 ${(currentQuestion.type === "single" ? answers[currentQuestion.id] === option.value : answers["pain-points"].includes(option.value)) ? "bg-blue-600 border-blue-600" : "border-slate-300 dark:border-slate-500"}`, children: (currentQuestion.type === "single" ? answers[currentQuestion.id] === option.value : answers["pain-points"].includes(option.value)) && /* @__PURE__ */ jsx(CheckCircle2, { className: "w-4 h-4 text-white" }) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 dark:text-white", children: option.label }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400", children: option.desc })
            ] })
          ] })
        },
        option.value
      )) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
      currentQuestionIndex > 0 && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setCurrentQuestionIndex((prev) => prev - 1),
          className: "flex-1 py-3 px-6 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all",
          children: "Back"
        }
      ),
      isLastQuestion ? /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleSubmit,
          disabled: !answeredAll || isLoading,
          className: "flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2",
          children: isLoading ? "Getting Your Recommendation..." : /* @__PURE__ */ jsxs(Fragment, { children: [
            "Get My Plan ",
            /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
          ] })
        }
      ) : /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setCurrentQuestionIndex((prev) => prev + 1),
          disabled: !answers[currentQuestion.id] && currentQuestion.type === "single",
          className: "flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2",
          children: [
            "Next ",
            /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
          ]
        }
      )
    ] })
  ] }) });
}
const PLAN_ICONS = {
  "Learn & Build": /* @__PURE__ */ jsx(Zap, { className: "w-8 h-8" }),
  "Tune & Polish": /* @__PURE__ */ jsx(Rocket, { className: "w-8 h-8" }),
  "Zero to Hero": /* @__PURE__ */ jsx(Crown, { className: "w-8 h-8" })
};
function PlanSelection({ recommendation, onPlanSelected }) {
  var _a;
  const { selectPlan, isLoading, plans: allPlans } = useSubscriptionStore();
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  useEffect(() => {
    if (recommendation == null ? void 0 : recommendation.recommendedPlan) {
      setSelectedPlanId(recommendation.recommendedPlan.id);
    }
  }, [recommendation]);
  const handleSelectPlan = async (planId) => {
    setSelectedPlanId(planId);
    try {
      await selectPlan(planId);
      setTimeout(() => {
        window.location.href = "/payment-confirm";
      }, 500);
    } catch (err) {
      console.error("Failed to select plan:", err);
    }
  };
  const isRecommended = (plan) => {
    if (!(recommendation == null ? void 0 : recommendation.recommendedPlan)) return false;
    return recommendation.recommendedPlan.id === plan.id || recommendation.recommendedPlan.name === plan.name;
  };
  const plans = allPlans.length > 0 ? allPlans : (recommendation == null ? void 0 : recommendation.allPlans) || [];
  return /* @__PURE__ */ jsx("div", { className: "w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-6 overflow-y-auto", children: /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-12", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 dark:text-white mb-3", children: "Choose Your Perfect Plan" }),
      /* @__PURE__ */ jsxs("p", { className: "text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto", children: [
        "We recommend ",
        /* @__PURE__ */ jsx("span", { className: "font-bold text-blue-600 dark:text-blue-400", children: (_a = recommendation == null ? void 0 : recommendation.recommendedPlan) == null ? void 0 : _a.name }),
        " based on your answers, but you can choose any plan."
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid md:grid-cols-3 gap-8 mb-8", children: plans.map((plan) => {
      const planData = plan;
      const isSelected = selectedPlanId === plan.id;
      const recommended = isRecommended(plan);
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: `relative rounded-2xl transition-all ${recommended ? "ring-2 ring-blue-600 transform scale-105 shadow-2xl" : "shadow-lg hover:shadow-xl"} ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`,
          children: [
            recommended && /* @__PURE__ */ jsx("div", { className: "absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold", children: "Recommended for You" }),
            /* @__PURE__ */ jsxs("div", { className: "p-8", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
                /* @__PURE__ */ jsx("div", { className: "text-blue-600 dark:text-blue-400", children: PLAN_ICONS[planData.name] }),
                /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-slate-900 dark:text-white", children: planData.name })
              ] }),
              planData.price !== void 0 && /* @__PURE__ */ jsx("div", { className: "mb-6", children: planData.price === 0 ? /* @__PURE__ */ jsx("p", { className: "text-3xl font-black text-blue-600", children: "Free" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsxs("p", { className: "text-4xl font-black text-slate-900 dark:text-white", children: [
                  "$",
                  planData.price
                ] }),
                /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400", children: "/month" })
              ] }) }),
              planData.description && /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-300 mb-6", children: planData.description }),
              planData.features && /* @__PURE__ */ jsx("div", { className: "mb-8 space-y-3", children: planData.features.map((feature, idx) => /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ jsx(Check, { className: "w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" }),
                /* @__PURE__ */ jsx("span", { className: "text-slate-700 dark:text-slate-300", children: feature })
              ] }, idx)) }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => handleSelectPlan(plan.id || plan.plan),
                  disabled: isLoading,
                  className: `w-full py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isSelected || recommended ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600"} ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`,
                  children: isSelected ? /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(Check, { className: "w-5 h-5" }),
                    " Selected"
                  ] }) : "Choose Plan"
                }
              )
            ] })
          ]
        },
        plan.id
      );
    }) }),
    /* @__PURE__ */ jsx("p", { className: "text-center text-sm text-slate-600 dark:text-slate-400", children: "You can change your plan anytime. All plans include customer support and regular updates." })
  ] }) });
}
const STEPS$1 = {
  QUESTIONNAIRE: "questionnaire",
  PLAN_SELECTION: "plan-selection",
  COMPLETE: "complete"
};
function Onboarding() {
  const { isAuthenticated } = useAuthStore();
  const { recommendation, onboardingComplete, fetchPlans } = useSubscriptionStore();
  const [currentStep, setCurrentStep] = useState(STEPS$1.QUESTIONNAIRE);
  useEffect(() => {
    if (isAuthenticated) {
      fetchPlans();
    }
  }, [isAuthenticated, fetchPlans]);
  if (!isAuthenticated) {
    return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  }
  if (onboardingComplete) {
    return /* @__PURE__ */ jsx(Navigate, { to: "/dashboard", replace: true });
  }
  const handleQuestionnaireComplete = () => {
    setCurrentStep(STEPS$1.PLAN_SELECTION);
  };
  const handlePlanSelected = () => {
    setCurrentStep(STEPS$1.COMPLETE);
    setTimeout(() => {
      window.location.href = "/payment-confirm";
    }, 500);
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full h-screen overflow-hidden", children: [
    currentStep === STEPS$1.QUESTIONNAIRE && /* @__PURE__ */ jsx(OnboardingQuestionnaire, { onComplete: handleQuestionnaireComplete }),
    currentStep === STEPS$1.PLAN_SELECTION && recommendation && /* @__PURE__ */ jsx(PlanSelection, { recommendation, onPlanSelected: handlePlanSelected }),
    currentStep === STEPS$1.COMPLETE && /* @__PURE__ */ jsx("div", { className: "w-full h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "text-6xl mb-4", children: "🎉" }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 dark:text-white mb-3", children: "All Set!" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-600 dark:text-slate-400 mb-6", children: "Redirecting to your dashboard..." }),
      /* @__PURE__ */ jsx("div", { className: "w-64 h-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full mx-auto animate-pulse" })
    ] }) })
  ] });
}
function PaymentConfirm() {
  const { isAuthenticated } = useAuthStore();
  const [isProcessing, setIsProcessing] = useState(true);
  if (!isAuthenticated) {
    return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  }
  const handleContinue = () => {
    setIsProcessing(false);
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1e3);
  };
  if (!isProcessing) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "text-6xl mb-4 animate-bounce", children: "✅" }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 dark:text-white mb-3", children: "Payment Confirmed!" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-600 dark:text-slate-400 mb-8", children: "Redirecting to your dashboard..." }),
      /* @__PURE__ */ jsx("div", { className: "w-64 h-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full mx-auto animate-pulse" })
    ] }) });
  }
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full text-center space-y-8", children: [
    /* @__PURE__ */ jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxs("div", { className: "relative w-24 h-24", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-blue-600 rounded-full animate-pulse opacity-30" }),
      /* @__PURE__ */ jsx("div", { className: "absolute inset-2 bg-blue-600 rounded-full animate-pulse opacity-60", style: { animationDelay: "0.2s" } }),
      /* @__PURE__ */ jsx("div", { className: "absolute inset-4 bg-blue-600 rounded-full flex items-center justify-center", children: /* @__PURE__ */ jsx(Zap, { className: "w-10 h-10 text-white" }) })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 dark:text-white mb-3", children: "Processing Payment" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-600 dark:text-slate-400", children: "We're finalizing your plan selection and setting up your account..." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-left bg-white dark:bg-slate-800 rounded-xl p-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "w-4 h-4 rounded-full bg-green-500 animate-bounce" }),
        /* @__PURE__ */ jsx("span", { className: "text-slate-700 dark:text-slate-300 font-medium", children: "Plan selected" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "w-4 h-4 rounded-full bg-blue-500 animate-bounce", style: { animationDelay: "0.2s" } }),
        /* @__PURE__ */ jsx("span", { className: "text-slate-700 dark:text-slate-300 font-medium", children: "Activating tools" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "w-4 h-4 rounded-full bg-indigo-500 animate-bounce", style: { animationDelay: "0.4s" } }),
        /* @__PURE__ */ jsx("span", { className: "text-slate-700 dark:text-slate-300 font-medium", children: "Preparing dashboard" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: handleContinue,
        className: "w-full py-4 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95",
        children: "Continue to Dashboard"
      }
    ),
    /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400", children: "This page will auto-redirect in a few seconds..." })
  ] }) });
}
function LoadingButton({ loading, children, ...props }) {
  return /* @__PURE__ */ jsxs("button", { ...props, disabled: loading || props.disabled, className: `flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed ${props.className}`, children: [
    loading && /* @__PURE__ */ jsx(Loader, { className: "w-4 h-4 animate-spin" }),
    children
  ] });
}
function PlanChangeModal({
  isOpen,
  currentPlan,
  targetPlan,
  onConfirm,
  onCancel,
  isLoading,
  error
}) {
  if (!isOpen || !currentPlan || !targetPlan) return null;
  const changeType = getChangeType(currentPlan.name, targetPlan.name);
  const { gained, lost } = getFeatureDiff(currentPlan.features, targetPlan.features);
  const isDowngrade = changeType === "downgrade";
  const priceDelta = (targetPlan.price || 0) - (currentPlan.price || 0);
  return /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4", children: [
    /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-black/50 backdrop-blur-sm", onClick: onCancel }),
    /* @__PURE__ */ jsxs("div", { className: "relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onCancel,
          disabled: isLoading,
          className: "absolute top-4 right-4 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50",
          "aria-label": "Close",
          children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5 text-slate-500" })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "p-8", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-widest text-slate-400 mb-2", children: isDowngrade ? "Confirm downgrade" : "Confirm plan change" }),
        /* @__PURE__ */ jsxs("h2", { className: "text-2xl font-black text-slate-900 dark:text-white mb-6", children: [
          "Switch to ",
          targetPlan.name,
          "?"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 mb-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex-1 text-center", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 font-bold uppercase mb-1", children: "Current" }),
            /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 dark:text-white", children: currentPlan.name }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: formatPrice(currentPlan.price) })
          ] }),
          /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5 text-blue-500 shrink-0" }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 text-center", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs text-blue-500 font-bold uppercase mb-1", children: "New" }),
            /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 dark:text-white", children: targetPlan.name }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: formatPrice(targetPlan.price) })
          ] })
        ] }),
        priceDelta !== 0 && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400 mb-4", children: priceDelta > 0 ? `Your monthly cost increases by $${priceDelta}.` : priceDelta < 0 ? `You'll save $${Math.abs(priceDelta)}/month on this plan.` : "No change to monthly cost." }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4 mb-6 max-h-48 overflow-y-auto", children: [
          gained.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("p", { className: "text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2 flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(Plus, { className: "w-3.5 h-3.5" }),
              " Tools you'll unlock (",
              gained.length,
              ")"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "space-y-1.5", children: gained.map((feature) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300", children: [
              /* @__PURE__ */ jsx(Check, { className: "w-4 h-4 text-emerald-500 shrink-0" }),
              feature
            ] }, feature)) })
          ] }),
          lost.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("p", { className: "text-xs font-bold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(Minus, { className: "w-3.5 h-3.5" }),
              " Tools you'll lose access to (",
              lost.length,
              ")"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "space-y-1.5", children: lost.map((feature) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400", children: [
              /* @__PURE__ */ jsx(Minus, { className: "w-4 h-4 text-amber-500 shrink-0" }),
              feature
            ] }, feature)) }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-2", children: "Your saved data stays intact — you just won't be able to open these tools until you upgrade again." })
          ] }),
          gained.length === 0 && lost.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Same tool access — you're switching between equivalent tiers." })
        ] }),
        error && /* @__PURE__ */ jsx("div", { className: "mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm", children: error }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: onCancel,
              disabled: isLoading,
              className: "flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-600 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsx(
            LoadingButton,
            {
              loading: isLoading,
              onClick: onConfirm,
              className: `flex-1 py-3 px-4 rounded-xl font-bold text-white transition-colors ${isDowngrade ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`,
              children: isDowngrade ? "Confirm downgrade" : "Confirm switch"
            }
          )
        ] })
      ] })
    ] })
  ] });
}
const PLAN_STYLES = {
  "Learn & Build": {
    ring: "ring-blue-500/30",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    button: "bg-blue-600 hover:bg-blue-700"
  },
  "Tune & Polish": {
    ring: "ring-purple-500/30",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    button: "bg-purple-600 hover:bg-purple-700"
  },
  "Zero to Hero": {
    ring: "ring-amber-500/30",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    button: "bg-amber-600 hover:bg-amber-700"
  }
};
function PlanSettings() {
  var _a, _b, _c, _d;
  const { isAuthenticated } = useAuthStore();
  const { userPlan, plans, selectPlan, isLoading, fetchPlans, getUserPlan } = useSubscriptionStore();
  const location = useLocation();
  const [pageLoading, setPageLoading] = useState(true);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [switchError, setSwitchError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const highlightPlan = ((_a = location.state) == null ? void 0 : _a.highlightPlan) || null;
  const fromTool = ((_b = location.state) == null ? void 0 : _b.fromTool) || null;
  useEffect(() => {
    let mounted = true;
    (async () => {
      setPageLoading(true);
      await Promise.all([fetchPlans(), getUserPlan()]);
      if (mounted) setPageLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [fetchPlans, getUserPlan]);
  useEffect(() => {
    api.get("/auth/sessions").then(({ data }) => {
      const sessions = data.sessions || [];
      setCurrentSession(sessions.find((s) => s.isCurrent) || sessions[0] || null);
    }).catch(() => setCurrentSession(null)).finally(() => setSessionLoading(false));
  }, []);
  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => {
      var _a2, _b2;
      return (((_a2 = PLAN_META[a.name]) == null ? void 0 : _a2.tier) || 0) - (((_b2 = PLAN_META[b.name]) == null ? void 0 : _b2.tier) || 0);
    }),
    [plans]
  );
  useEffect(() => {
    if (!highlightPlan || pageLoading || sortedPlans.length === 0) return;
    const slug = highlightPlan.replace(/\s+/g, "-").toLowerCase();
    const el = document.getElementById(`plan-${slug}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlightPlan, pageLoading, sortedPlans.length]);
  if (!isAuthenticated) {
    return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  }
  const openSwitchModal = (plan) => {
    if (!userPlan || plan.id === userPlan.id) return;
    setSwitchError(null);
    setPendingPlan(plan);
  };
  const closeSwitchModal = () => {
    if (isLoading) return;
    setPendingPlan(null);
    setSwitchError(null);
  };
  const confirmSwitch = async () => {
    var _a2, _b2;
    if (!pendingPlan) return;
    setSwitchError(null);
    try {
      await selectPlan(pendingPlan.id);
      setPendingPlan(null);
      setSuccessMessage(`You're now on ${pendingPlan.name}. Your tools have been updated.`);
      setTimeout(() => setSuccessMessage(null), 6e3);
    } catch (err) {
      setSwitchError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.error) || "Failed to switch plans. Please try again.");
    }
  };
  const getActionLabel = (plan) => {
    if (!userPlan) return "Select plan";
    if (plan.id === userPlan.id) return "Current plan";
    const changeType = getChangeType(userPlan.name, plan.name);
    if (changeType === "upgrade") return `Upgrade to ${plan.name}`;
    if (changeType === "downgrade") return `Switch to ${plan.name}`;
    return `Switch to ${plan.name}`;
  };
  return /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-10", children: [
      /* @__PURE__ */ jsxs(
        Link,
        {
          to: "/dashboard",
          className: "inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors mb-6",
          children: [
            /* @__PURE__ */ jsx(ArrowLeft, { className: "w-4 h-4" }),
            "Back to dashboard"
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-widest text-blue-600 mb-2", children: "Subscription" }),
          /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 dark:text-white tracking-tight", children: "Manage your plan" }),
          /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-500 mt-2 max-w-xl", children: "Compare tiers, preview what changes, and switch instantly — no page reload needed." })
        ] }),
        fromTool && highlightPlan && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-2xl px-5 py-4 flex items-start gap-3 max-w-md", children: [
          /* @__PURE__ */ jsx(Sparkles, { className: "w-5 h-5 text-amber-500 shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("p", { className: "text-sm font-bold text-slate-900 dark:text-white", children: [
              "Unlock ",
              fromTool
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-500", children: [
              highlightPlan,
              " includes this tool. Review the plan below to upgrade."
            ] })
          ] })
        ] })
      ] })
    ] }),
    successMessage && /* @__PURE__ */ jsxs("div", { className: "mb-8 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 animate-in fade-in slide-in-from-top-2", children: [
      /* @__PURE__ */ jsx(Check, { className: "w-5 h-5 text-emerald-600 shrink-0" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-emerald-800 dark:text-emerald-200", children: successMessage }),
      /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "ml-auto text-sm font-bold text-emerald-700 hover:underline shrink-0", children: "Go to dashboard" })
    ] }),
    pageLoading ? /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 mb-10 animate-pulse", children: [
      /* @__PURE__ */ jsx("div", { className: "h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-4" }),
      /* @__PURE__ */ jsx("div", { className: "h-10 w-64 bg-slate-200 dark:bg-slate-700 rounded" })
    ] }) : userPlan ? /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 mb-10 border-2 border-blue-500/20 relative overflow-hidden", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full -mr-16 -mt-16" }),
      /* @__PURE__ */ jsxs("div", { className: "relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg", children: /* @__PURE__ */ jsx(Crown, { className: "w-7 h-7" }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-widest text-blue-600 mb-1", children: "Your current plan" }),
            /* @__PURE__ */ jsx("h2", { className: "text-3xl font-black text-slate-900 dark:text-white", children: userPlan.name }),
            /* @__PURE__ */ jsxs("p", { className: "text-slate-500 mt-1", children: [
              formatPrice(userPlan.price),
              " · ",
              ((_c = userPlan.features) == null ? void 0 : _c.length) || 0,
              " tools unlocked"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
          (userPlan.features || []).slice(0, 4).map((f) => /* @__PURE__ */ jsx("span", { className: "px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-semibold text-blue-700 dark:text-blue-300", children: f }, f)),
          (((_d = userPlan.features) == null ? void 0 : _d.length) || 0) > 4 && /* @__PURE__ */ jsxs("span", { className: "px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500", children: [
            "+",
            userPlan.features.length - 4,
            " more"
          ] })
        ] })
      ] })
    ] }) : null,
    /* @__PURE__ */ jsx("div", { className: "grid md:grid-cols-3 gap-6 mb-16", children: pageLoading ? [1, 2, 3].map((i) => /* @__PURE__ */ jsx("div", { className: "glass-card rounded-3xl p-8 animate-pulse h-96" }, i)) : sortedPlans.map((plan) => {
      const meta = PLAN_META[plan.name] || {};
      const PlanIcon = meta.icon || Crown;
      const styles = PLAN_STYLES[plan.name] || PLAN_STYLES["Learn & Build"];
      const isCurrent = (userPlan == null ? void 0 : userPlan.id) === plan.id;
      const isHighlighted = highlightPlan === plan.name && !isCurrent;
      const changeType = userPlan ? getChangeType(userPlan.name, plan.name) : "same";
      return /* @__PURE__ */ jsxs(
        "div",
        {
          id: `plan-${plan.name.replace(/\s+/g, "-").toLowerCase()}`,
          className: `relative glass-card rounded-3xl p-8 flex flex-col transition-all duration-300 ${isCurrent ? `ring-2 ring-blue-600 shadow-lg ${styles.ring}` : isHighlighted ? "ring-2 ring-amber-500 shadow-xl scale-[1.02]" : "hover:shadow-lg hover:-translate-y-1"}`,
          children: [
            isCurrent && /* @__PURE__ */ jsx("span", { className: "absolute -top-3 left-6 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold", children: "Active" }),
            isHighlighted && /* @__PURE__ */ jsx("span", { className: "absolute -top-3 right-6 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold", children: "Recommended" }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-5", children: [
              /* @__PURE__ */ jsx("div", { className: `w-12 h-12 rounded-xl flex items-center justify-center ${styles.badge}`, children: /* @__PURE__ */ jsx(PlanIcon, { className: "w-6 h-6" }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h3", { className: "text-xl font-black text-slate-900 dark:text-white", children: plan.name }),
                /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: meta.tagline || plan.description })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mb-6", children: [
              /* @__PURE__ */ jsx("p", { className: "text-4xl font-black text-slate-900 dark:text-white", children: plan.price === 0 ? "Free" : `₹${plan.price}` }),
              plan.price > 0 && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "per month" })
            ] }),
            meta.bestFor && /* @__PURE__ */ jsxs("div", { className: "mb-5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700", children: [
              /* @__PURE__ */ jsx("p", { className: "text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5", children: "Best for" }),
              /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-700 dark:text-slate-300", children: meta.bestFor })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "flex-1 space-y-2.5 mb-6", children: (plan.features || []).map((feature) => /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2.5", children: [
              /* @__PURE__ */ jsx(Check, { className: "w-4 h-4 text-emerald-500 shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsx("span", { className: "text-sm text-slate-700 dark:text-slate-300", children: feature })
            ] }, feature)) }),
            meta.outcome && /* @__PURE__ */ jsxs("div", { className: "mb-6 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50", children: [
              /* @__PURE__ */ jsx(Sparkles, { className: "w-4 h-4 text-emerald-600 shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-emerald-800 dark:text-emerald-300", children: meta.outcome })
            ] }),
            isCurrent ? /* @__PURE__ */ jsx("div", { className: "w-full py-3.5 px-4 rounded-xl font-bold text-center bg-blue-600/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800", children: "✓ Current plan" }) : /* @__PURE__ */ jsxs(
              LoadingButton,
              {
                loading: isLoading && (pendingPlan == null ? void 0 : pendingPlan.id) === plan.id,
                disabled: isLoading,
                onClick: () => openSwitchModal(plan),
                className: `w-full py-3.5 px-4 rounded-xl font-bold text-white transition-all active:scale-[0.98] ${changeType === "downgrade" ? "bg-slate-700 hover:bg-slate-800" : styles.button}`,
                children: [
                  getActionLabel(plan),
                  /* @__PURE__ */ jsx(ChevronRight, { className: "w-4 h-4" })
                ]
              }
            )
          ]
        },
        plan.id
      );
    }) }),
    /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 mb-16 max-w-3xl", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-xl font-black text-slate-900 dark:text-white mb-2", children: "Device session" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mb-6", children: 'Your account allows one active device at a time. Signing in elsewhere ends this session. To switch computers, sign in on the new device and choose "Use this device instead" on the login screen.' }),
      sessionLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400", children: "Loading session…" }) : !currentSession ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400", children: "No active session found." }) : /* @__PURE__ */ jsxs("div", { className: "p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsxs("p", { className: "font-bold text-slate-900 dark:text-white", children: [
          currentSession.deviceName,
          /* @__PURE__ */ jsx("span", { className: "ml-2 text-xs font-bold text-emerald-600", children: "This device" })
        ] }),
        currentSession.ipAddress && /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
          "IP: ",
          currentSession.ipAddress
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
          "Last active ",
          new Date(currentSession.lastActiveAt).toLocaleString()
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 max-w-3xl", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-xl font-black text-slate-900 dark:text-white mb-6", children: "How plan changes work" }),
      /* @__PURE__ */ jsx("div", { className: "grid sm:grid-cols-3 gap-6", children: [
        { step: "1", title: "Preview changes", desc: "See exactly which tools you gain or lose before confirming." },
        { step: "2", title: "Instant activation", desc: "Your new plan applies immediately — no reload or re-login." },
        { step: "3", title: "Data preserved", desc: "Downgrading locks tools but keeps all your saved work." }
      ].map((item) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-black flex items-center justify-center mb-3", children: item.step }),
        /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 dark:text-white mb-1", children: item.title }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: item.desc })
      ] }, item.step)) })
    ] }),
    /* @__PURE__ */ jsx(
      PlanChangeModal,
      {
        isOpen: !!pendingPlan,
        currentPlan: userPlan,
        targetPlan: pendingPlan,
        onConfirm: confirmSwitch,
        onCancel: closeSwitchModal,
        isLoading,
        error: switchError
      }
    )
  ] });
}
const questions = [
  { id: 1, text: "How do you handle state in a large React application?", category: "React" },
  { id: 2, text: "Explain the concept of Event Loop in JavaScript.", category: "JavaScript" },
  { id: 3, text: "How would you optimize a slow SQL query?", category: "Database" },
  { id: 4, text: "Describe a time you resolved a conflict with a teammate.", category: "Soft Skills" }
];
const ScoreRing$1 = ({ value, label, color }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - value / 100 * circumference;
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "relative w-24 h-24", children: [
      /* @__PURE__ */ jsxs("svg", { className: "w-24 h-24 -rotate-90", viewBox: "0 0 80 80", children: [
        /* @__PURE__ */ jsx("circle", { cx: "40", cy: "40", r: radius, fill: "none", stroke: "currentColor", strokeWidth: "6", className: "text-surface-container" }),
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "40",
            cy: "40",
            r: radius,
            fill: "none",
            stroke: color,
            strokeWidth: "6",
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            strokeLinecap: "round",
            style: { transition: "stroke-dashoffset 1.2s ease-out" }
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsx("span", { className: "text-xl font-black text-on-surface", children: value }) })
    ] }),
    /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-outline uppercase tracking-wider text-center", children: label })
  ] });
};
function SkillAssessment() {
  var _a, _b, _c, _d;
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmap, setRoadmap] = useState(null);
  const handleNext = () => {
    if (currentQ < questions.length - 1) setCurrentQ((prev) => prev + 1);
  };
  const handlePrev = () => {
    if (currentQ > 0) setCurrentQ((prev) => prev - 1);
  };
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/skills/assessment", { answers });
      setResult(data);
    } catch (err) {
      console.error(err);
      setResult({
        strengths: ["JavaScript", "Soft Skills"],
        gaps: ["Database Optimization", "Advanced React Patterns"],
        role_matches: ["Frontend Developer (Junior)", "Full Stack Trainee"],
        analysis: "Based on your responses, you demonstrate foundational knowledge with room for growth.",
        scores: { technical_depth: 55, problem_solving: 60, communication: 70, industry_readiness: 45 }
      });
    } finally {
      setLoading(false);
    }
  };
  const generateRoadmap = async () => {
    var _a2;
    if (!(result == null ? void 0 : result.gaps)) return;
    setRoadmapLoading(true);
    try {
      const { data } = await api.post("/learning/generate-roadmap", {
        gaps: result.gaps,
        targetRole: ((_a2 = result.role_matches) == null ? void 0 : _a2[0]) || "Junior Developer"
      });
      setRoadmap(data.data.roadmap);
    } catch (err) {
      console.error("Roadmap error:", err);
    } finally {
      setRoadmapLoading(false);
    }
  };
  if (roadmap) {
    const typeIcons = { video: "play_circle", article: "article", project: "code", exercise: "fitness_center" };
    const priorityColors = { high: "bg-rose-500/10 text-rose-700", medium: "bg-amber-500/10 text-amber-700", low: "bg-emerald-500/10 text-emerald-700" };
    return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-12 px-4 sm:px-6", children: [
      /* @__PURE__ */ jsxs("button", { onClick: () => setRoadmap(null), className: "mb-6 flex items-center gap-2 text-primary font-bold hover:underline", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "arrow_back" }),
        "Back to Results"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mb-10", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-on-surface font-headline mb-3", children: roadmap.title }),
        /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium", children: roadmap.summary }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-xl text-primary font-bold text-sm", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 0" }, children: "schedule" }),
          "~",
          roadmap.estimated_total_hours,
          " hours total"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "space-y-8", children: (_a = roadmap.weeks) == null ? void 0 : _a.map((week, wi) => {
        var _a2, _b2;
        return /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 mb-6", children: [
            /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center text-on-primary font-black text-lg", children: week.week }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface", children: week.theme }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-outline", children: (_a2 = week.goals) == null ? void 0 : _a2.join(" • ") })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3", children: (_b2 = week.tasks) == null ? void 0 : _b2.map((task, ti) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 p-4 bg-surface-container rounded-2xl hover:bg-surface-container-high transition-all", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-primary text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: typeIcons[task.type] || "task" }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsx("p", { className: "font-bold text-on-surface text-sm", children: task.title }),
              /* @__PURE__ */ jsxs("p", { className: "text-xs text-outline mt-0.5", children: [
                task.resource,
                " · ",
                task.duration
              ] })
            ] }),
            /* @__PURE__ */ jsx("span", { className: `px-3 py-1 rounded-xl text-xs font-bold uppercase ${priorityColors[task.priority] || ""}`, children: task.priority })
          ] }, ti)) })
        ] }, wi);
      }) }),
      roadmap.milestones && /* @__PURE__ */ jsxs("div", { className: "mt-10 glass-card p-8 rounded-3xl border-emerald-500/20", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600 text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "flag" }),
          "Milestones"
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: roadmap.milestones.map((m, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-3 text-on-surface-variant font-medium", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-500 text-sm mt-1", style: { fontVariationSettings: "'FILL' 1" }, children: "check_circle" }),
          m
        ] }, i)) })
      ] })
    ] });
  }
  if (result) {
    const scoreColors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"];
    const scoreLabels = ["Technical Depth", "Problem Solving", "Communication", "Industry Ready"];
    const scoreValues = result.scores ? [result.scores.technical_depth, result.scores.problem_solving, result.scores.communication, result.scores.industry_readiness] : [55, 60, 70, 45];
    return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-12 px-4 sm:px-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-10", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-3xl font-black text-on-surface font-headline flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-primary text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "psychology" }),
            "AI Assessment Complete"
          ] }),
          result.ai_powered && /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-emerald-500/10 text-emerald-700 text-xs font-bold rounded-xl", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xs", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_awesome" }),
            "AI-Powered Analysis"
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              setResult(null);
              setCurrentQ(0);
              setAnswers({});
            },
            className: "px-5 py-3 bg-surface-container text-on-surface rounded-2xl font-bold hover:bg-surface-container-high transition-all text-sm",
            children: "Retake"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl mb-8", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-on-surface mb-6", children: "Performance Breakdown" }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-6 justify-items-center", children: scoreLabels.map((label, i) => /* @__PURE__ */ jsx(ScoreRing$1, { value: scoreValues[i] || 50, label, color: scoreColors[i] }, i)) })
      ] }),
      result.analysis && /* @__PURE__ */ jsx("div", { className: "bg-primary/5 p-6 rounded-3xl mb-8", children: /* @__PURE__ */ jsx("p", { className: "text-on-surface font-medium leading-relaxed", children: result.analysis }) }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8 mb-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-6 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-500 text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "check_circle" }),
            "Strengths"
          ] }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: (_b = result.strengths) == null ? void 0 : _b.map((s, i) => /* @__PURE__ */ jsxs("li", { className: "text-on-surface-variant bg-surface-container px-4 py-3 rounded-xl font-medium flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-primary text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: "star" }),
            s
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-6 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-rose-500 text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "warning" }),
            "Skill Gaps Identified"
          ] }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: (_c = result.gaps) == null ? void 0 : _c.map((g, i) => /* @__PURE__ */ jsxs("li", { className: "text-on-surface-variant bg-surface-container px-4 py-3 rounded-xl font-medium flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-amber-500 text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: "lightbulb" }),
            g
          ] }, i)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-primary/5 p-8 rounded-3xl mb-8", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-primary mb-6 font-headline", children: "Recommended Roles" }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-3", children: (_d = result.role_matches) == null ? void 0 : _d.map((r, i) => /* @__PURE__ */ jsx("span", { className: "bg-surface-container-lowest text-on-surface px-5 py-3 rounded-full font-semibold shadow-sm", children: r }, i)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-gradient-to-r from-indigo-600 to-purple-600 p-8 rounded-3xl text-center", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-white mb-3 font-headline", children: "Bridge Your Gaps in 4 Weeks" }),
        /* @__PURE__ */ jsx("p", { className: "text-indigo-100 mb-6 font-medium", children: "AI will generate a personalized learning roadmap based on your skill gaps." }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: generateRoadmap,
            disabled: roadmapLoading,
            className: "px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl hover:bg-indigo-50 active:scale-95 transition-all shadow-lg flex items-center gap-3 mx-auto disabled:opacity-60",
            children: roadmapLoading ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
              "Generating..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_awesome" }),
              "Generate AI Learning Roadmap"
            ] })
          }
        )
      ] })
    ] });
  }
  const q = questions[currentQ];
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-12 flex justify-between items-center", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-2", children: "Skill Assessment" }),
        /* @__PURE__ */ jsxs("p", { className: "text-on-surface-variant font-medium flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base text-primary", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_awesome" }),
          "AI-Powered Technical Evaluation"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card px-6 py-3 rounded-2xl", children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm font-bold text-outline uppercase tracking-wider mb-1", children: "Progress" }),
        /* @__PURE__ */ jsxs("div", { className: "text-2xl font-black text-on-surface", children: [
          currentQ + 1,
          " / ",
          questions.length
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "w-full bg-surface-container h-3 rounded-full mb-12 overflow-hidden", children: /* @__PURE__ */ jsx(
      "div",
      {
        className: "h-full bg-gradient-to-r from-primary to-primary-container rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(0,78,159,0.4)]",
        style: { width: `${(currentQ + 1) / questions.length * 100}%` }
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl min-h-[400px] flex flex-col", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-primary text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "category" }),
        /* @__PURE__ */ jsx("span", { className: "inline-block px-4 py-2 bg-primary/10 text-primary text-sm font-bold rounded-xl uppercase tracking-wider", children: q.category })
      ] }),
      /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-on-surface mb-8 font-headline leading-tight", children: q.text }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "flex-grow w-full bg-surface-container rounded-2xl p-6 focus:ring-2 focus:ring-primary/20 outline-none resize-none font-medium text-on-surface placeholder:text-outline",
          placeholder: "Type your answer here... Be detailed but concise. The AI will analyze your technical depth and communication clarity.",
          value: answers[q.id] || "",
          onChange: (e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between mt-12 gap-4", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handlePrev,
          disabled: currentQ === 0,
          className: "px-8 py-4 bg-surface-container text-on-surface rounded-2xl font-bold hover:bg-surface-container-high transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
          children: "Previous"
        }
      ),
      currentQ === questions.length - 1 ? /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleSubmit,
          disabled: loading,
          className: "px-8 py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_20px_40px_rgba(0,78,159,0.15)] flex items-center gap-3",
          children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
            "AI Analyzing..."
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_awesome" }),
            "Complete Assessment"
          ] })
        }
      ) : /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: handleNext,
          className: "px-8 py-4 bg-primary text-on-primary rounded-2xl font-bold hover:bg-primary-container active:scale-95 transition-all duration-200 shadow-[0px_10px_30px_rgba(0,78,159,0.2)] flex items-center gap-3",
          children: [
            "Next Question",
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "arrow_forward" })
          ]
        }
      )
    ] })
  ] });
}
function scoreColor$2(s) {
  return s >= 80 ? "green" : s >= 60 ? "amber" : "red";
}
function scoreBadge(s) {
  if (s >= 85) return { label: "Excellent", cls: "bg-green-50 text-green-700" };
  if (s >= 70) return { label: "Good", cls: "bg-amber-50 text-amber-700" };
  if (s >= 55) return { label: "Fair", cls: "bg-orange-50 text-orange-700" };
  return { label: "Needs Work", cls: "bg-red-50 text-red-700" };
}
const colorMap = {
  green: { bar: "from-green-400 to-green-600", bg: "bg-green-50", text: "text-green-700" },
  amber: { bar: "from-amber-400 to-amber-600", bg: "bg-amber-50", text: "text-amber-700" },
  red: { bar: "from-red-400   to-red-500", bg: "bg-red-50", text: "text-red-700" }
};
function ScoreBar({ label, score, icon }) {
  const c = colorMap[scoreColor$2(score)];
  return /* @__PURE__ */ jsxs("div", { className: `${c.bg} rounded-2xl p-5 flex flex-col gap-3`, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm opacity-60", style: { fontVariationSettings: "'FILL' 0" }, children: icon }),
        /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-slate-600", children: label })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: `text-lg font-black ${c.text}`, children: [
        score,
        /* @__PURE__ */ jsx("span", { className: "text-xs font-medium opacity-60", children: "/100" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "w-full h-2 bg-white/70 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: `h-full bg-gradient-to-r ${c.bar} rounded-full transition-all duration-1000`, style: { width: `${score}%` } }) })
  ] });
}
function SuggestionCard({ type, category, message }) {
  const cfg = {
    success: { icon: "check_circle", cls: "text-green-600 bg-green-50 border-green-100" },
    warning: { icon: "warning", cls: "text-amber-600 bg-amber-50 border-amber-100" },
    info: { icon: "info", cls: "text-blue-600  bg-blue-50  border-blue-100" }
  }[type] || { icon: "info", cls: "text-blue-600 bg-blue-50 border-blue-100" };
  return /* @__PURE__ */ jsxs("div", { className: `flex gap-4 p-4 rounded-xl border ${cfg.cls}`, children: [
    /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xl shrink-0 mt-0.5", style: { fontVariationSettings: "'FILL' 1" }, children: cfg.icon }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-wider mb-1 opacity-70", children: category }),
      /* @__PURE__ */ jsx("p", { className: "text-sm leading-relaxed", children: message })
    ] })
  ] });
}
function ScoreRing({ score }) {
  const badge = scoreBadge(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - score / 100 * circumference;
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "relative w-36 h-36", children: [
      /* @__PURE__ */ jsxs("svg", { className: "w-full h-full -rotate-90", viewBox: "0 0 120 120", children: [
        /* @__PURE__ */ jsx("circle", { cx: "60", cy: "60", r: "54", fill: "none", stroke: "#e2e8f0", strokeWidth: "10" }),
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "60",
            cy: "60",
            r: "54",
            fill: "none",
            strokeWidth: "10",
            strokeLinecap: "round",
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            className: `transition-all duration-1000 ${score >= 80 ? "stroke-green-500" : score >= 60 ? "stroke-amber-500" : "stroke-red-400"}`
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
        /* @__PURE__ */ jsx("span", { className: "text-3xl font-black text-slate-800", children: score }),
        /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-500 font-medium", children: "/ 100" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("span", { className: `text-sm font-bold px-4 py-1.5 rounded-full ${badge.cls}`, children: badge.label })
  ] });
}
function ATSRing({ score, label }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - score / 100 * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#0ea5e9" : score >= 40 ? "#f59e0b" : "#ef4444";
  const labelColor = score >= 80 ? "bg-emerald-50 text-emerald-700" : score >= 60 ? "bg-sky-50 text-sky-700" : score >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "relative w-40 h-40", children: [
      /* @__PURE__ */ jsxs("svg", { className: "w-full h-full -rotate-90", viewBox: "0 0 120 120", children: [
        /* @__PURE__ */ jsx("circle", { cx: "60", cy: "60", r: "54", fill: "none", stroke: "#e2e8f0", strokeWidth: "10" }),
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "60",
            cy: "60",
            r: "54",
            fill: "none",
            strokeWidth: "10",
            strokeLinecap: "round",
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            style: { stroke: color, transition: "stroke-dashoffset 1.2s ease" }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
        /* @__PURE__ */ jsxs("span", { className: "text-4xl font-black text-slate-800", children: [
          score,
          "%"
        ] }),
        /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-500 font-semibold mt-0.5", children: "ATS Match" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("span", { className: `text-sm font-bold px-4 py-1.5 rounded-full ${labelColor}`, children: label })
  ] });
}
function KeywordPill({ text, variant }) {
  return /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${variant === "match" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : variant === "missing" ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-100 text-slate-600 border border-slate-200"}`, children: [
    /* @__PURE__ */ jsx("span", { children: variant === "match" ? "✓" : variant === "missing" ? "✗" : "○" }),
    text
  ] });
}
function RecentUploads({ resumes, onResumeClick, onDeleteClick }) {
  const formatDate = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return /* @__PURE__ */ jsxs("section", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("h2", { className: "text-xl font-bold flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-primary", style: { fontVariationSettings: "'FILL' 0" }, children: "history" }),
      "Recent Uploads"
    ] }),
    resumes.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-2xl p-8 text-center text-on-surface-variant text-sm", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-3xl mb-3 block opacity-40", children: "description" }),
      "No resumes analyzed yet. Upload your first one!"
    ] }) : /* @__PURE__ */ jsx("div", { className: "space-y-4", children: resumes.map((r) => {
      var _a;
      const c = colorMap[scoreColor$2(r.overall_score)];
      const isPdf = (_a = r.file_name) == null ? void 0 : _a.toLowerCase().endsWith(".pdf");
      return /* @__PURE__ */ jsxs("div", { className: "relative group w-full", children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => onResumeClick(r.id),
            className: "w-full glass-card p-5 rounded-2xl transition-all duration-300 text-left",
            children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between mb-3 pr-8", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ jsx("div", { className: `w-10 h-12 ${isPdf ? "bg-red-50" : "bg-blue-50"} rounded-md flex items-center justify-center shrink-0`, children: /* @__PURE__ */ jsx("span", { className: `material-symbols-outlined ${isPdf ? "text-red-500" : "text-blue-500"}`, style: { fontVariationSettings: "'FILL' 0" }, children: isPdf ? "picture_as_pdf" : "description" }) }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("h5", { className: "font-bold text-sm truncate w-32", children: r.file_name }),
                    /* @__PURE__ */ jsx("p", { className: "text-[10px] uppercase font-bold text-outline tracking-wider", children: formatDate(r.created_at) })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("span", { className: `text-xs font-bold px-2 py-1 rounded ${c.bg} ${c.text}`, children: [
                  r.overall_score,
                  "/100"
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "w-full h-1.5 bg-surface-container rounded-full overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: `h-full bg-gradient-to-r ${c.bar} rounded-full`, style: { width: `${r.overall_score}%` } }) })
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              onDeleteClick(r.id);
            },
            title: "Delete",
            className: "absolute top-4 right-4 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200",
            children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: "delete" })
          }
        )
      ] }, r.id);
    }) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-4 rounded-3xl overflow-hidden aspect-video relative group bg-surface-container", children: [
      /* @__PURE__ */ jsx(
        "img",
        {
          alt: "Professional workspace",
          className: "w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 mix-blend-multiply",
          src: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-6", children: /* @__PURE__ */ jsx("p", { className: "text-xs font-bold italic text-white/90", children: '"Your resume is your professional signature."' }) })
    ] })
  ] });
}
function ResumeOptimizer() {
  var _a;
  const [activeTab, setActiveTab] = useState("analyze");
  const [file, setFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [recentResumes, setRecentResumes] = useState([]);
  const [forgeFile, setForgeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [forging, setForging] = useState(false);
  const [forgeError, setForgeError] = useState("");
  const [forgeResult, setForgeResult] = useState(null);
  const [copiedReadme, setCopiedReadme] = useState(false);
  const [forgeMode, setForgeMode] = useState("optimize");
  const [createFormData, setCreateFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    linkedin: "",
    github: "",
    targetJobTitle: "",
    targetJobDescription: "",
    summary: "",
    skills: "",
    experience: "",
    education: "",
    projects: "",
    outputFormat: "docx"
  });
  const [optimizeOutputFormat, setOptimizeOutputFormat] = useState("docx");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createResult, setCreateResult] = useState(null);
  const forgeDrop = useRef(false);
  useEffect(() => {
    fetchRecent();
  }, []);
  const fetchRecent = async () => {
    try {
      const { data } = await api.get("/resume/list");
      if (data.success) setRecentResumes(data.data);
    } catch {
    }
  };
  const handleDrop = (e) => {
    var _a2;
    e.preventDefault();
    setIsDragOver(false);
    const dropped = (_a2 = e.dataTransfer.files) == null ? void 0 : _a2[0];
    if (dropped && /\.(pdf|doc|docx)$/i.test(dropped.name)) setFile(dropped);
  };
  const handleUpload = async (e) => {
    var _a2, _b;
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const { data } = await api.post("/resume/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data.success) {
        setAnalysis(data.data);
        fetchRecent();
      }
    } catch (err) {
      setError(((_b = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b.error) || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };
  const handleResumeClick = async (id) => {
    try {
      const { data } = await api.get(`/resume/${id}`);
      if (data.success) setAnalysis(data.data);
    } catch {
    }
  };
  const handleDeleteClick = async (id) => {
    if (!window.confirm("Delete this resume?")) return;
    try {
      await api.delete(`/resume/${id}`);
      setRecentResumes((prev) => prev.filter((r) => r.id !== id));
      if ((analysis == null ? void 0 : analysis.id) === id) setAnalysis(null);
    } catch {
    }
  };
  const handleForgeDrop = (e) => {
    var _a2;
    e.preventDefault();
    forgeDrop.current = false;
    const dropped = (_a2 = e.dataTransfer.files) == null ? void 0 : _a2[0];
    if (dropped && /\.(pdf|doc|docx)$/i.test(dropped.name)) setForgeFile(dropped);
  };
  const handleForge = async (e) => {
    var _a2, _b;
    e.preventDefault();
    if (!forgeFile || !jobDescription.trim()) return;
    setForging(true);
    setForgeError("");
    setForgeResult(null);
    try {
      const fd = new FormData();
      fd.append("resume", forgeFile);
      fd.append("jobDescription", jobDescription);
      fd.append("outputFormat", optimizeOutputFormat);
      const { data } = await api.post("/resume/tune", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data.success) setForgeResult(data);
    } catch (err) {
      setForgeError(((_b = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b.error) || "Tuning failed. Please try again.");
    } finally {
      setForging(false);
    }
  };
  const handleCreateResume = async (e) => {
    var _a2, _b;
    e.preventDefault();
    if (!createFormData.fullName || !createFormData.targetJobDescription) return;
    setCreating(true);
    setCreateError("");
    setCreateResult(null);
    try {
      const { data } = await api.post("/resume/build", createFormData);
      if (data.success) {
        setCreateResult(data);
      }
    } catch (err) {
      console.error("Create error:", err);
      setCreateError(((_b = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b.error) || "Resume creation failed. Please try again.");
    } finally {
      setCreating(false);
    }
  };
  const handleDownloadGenerated = (result) => {
    if (!(result == null ? void 0 : result.fileBase64) || !(result == null ? void 0 : result.fileName) || !(result == null ? void 0 : result.mimeType)) return;
    const link = document.createElement("a");
    link.href = `data:${result.mimeType};base64,${result.fileBase64}`;
    link.download = result.fileName;
    link.click();
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12", children: [
    /* @__PURE__ */ jsxs("header", { className: "mb-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
        /* @__PURE__ */ jsx("div", { className: "w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600 text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }) }),
        /* @__PURE__ */ jsx("h1", { className: "text-4xl font-extrabold tracking-tight text-on-surface font-headline", children: "Resume Forge" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant max-w-2xl leading-relaxed", children: "Analyze your resume structure and ATS score, then forge a tailored version for any job description — using deterministic ATS-first logic." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-1 p-1 glass-card rounded-2xl w-fit mb-10", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setActiveTab("analyze"),
          className: `px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === "analyze" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
          children: /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 0" }, children: "analytics" }),
            "Analyze Resume"
          ] })
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setActiveTab("forge"),
          className: `px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === "forge" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
          children: /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
            "Forge for Job"
          ] })
        }
      )
    ] }),
    activeTab === "analyze" && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-8", children: [
        /* @__PURE__ */ jsx("div", { className: "glass-card rounded-3xl overflow-hidden", children: /* @__PURE__ */ jsxs("div", { className: "p-8", children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-xl font-bold mb-6 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-primary", style: { fontVariationSettings: "'FILL' 0" }, children: "upload_file" }),
            "Upload Resume"
          ] }),
          error && /* @__PURE__ */ jsxs("div", { className: "mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-red-500 shrink-0", children: "error" }),
            error
          ] }),
          /* @__PURE__ */ jsxs("form", { onSubmit: handleUpload, className: "space-y-5", children: [
            /* @__PURE__ */ jsxs(
              "div",
              {
                onDrop: handleDrop,
                onDragOver: (e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                },
                onDragLeave: () => setIsDragOver(false),
                onClick: () => document.getElementById("analyze-file-input").click(),
                className: `border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${isDragOver ? "border-primary bg-primary/5" : "border-outline/30 hover:border-primary/50 hover:bg-surface-container"}`,
                children: [
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      id: "analyze-file-input",
                      type: "file",
                      accept: ".pdf,.doc,.docx",
                      className: "hidden",
                      onChange: (e) => {
                        var _a2;
                        return setFile(((_a2 = e.target.files) == null ? void 0 : _a2[0]) || null);
                      }
                    }
                  ),
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-5xl text-outline/40 mb-3 block", style: { fontVariationSettings: "'FILL' 0" }, children: file ? "description" : "cloud_upload" }),
                  file ? /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("p", { className: "font-bold text-on-surface", children: file.name }),
                    /* @__PURE__ */ jsxs("p", { className: "text-sm text-on-surface-variant mt-1", children: [
                      (file.size / 1024).toFixed(0),
                      " KB · Click to change"
                    ] })
                  ] }) : /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("p", { className: "font-semibold text-on-surface", children: "Drop your resume here or click to browse" }),
                    /* @__PURE__ */ jsx("p", { className: "text-sm text-on-surface-variant mt-1", children: "PDF, DOC, DOCX — up to 10 MB" })
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "submit",
                disabled: !file || uploading,
                className: "w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-2xl hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(16,185,129,0.3)] flex items-center justify-center gap-3",
                children: uploading ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
                  "Analyzing..."
                ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "analytics" }),
                  "Analyze Resume"
                ] })
              }
            )
          ] })
        ] }) }),
        analysis && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-8 items-center sm:items-start mb-8", children: [
              /* @__PURE__ */ jsx(ScoreRing, { score: analysis.overall_score }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h2", { className: "text-2xl font-extrabold text-on-surface font-headline", children: analysis.file_name }),
                /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant mt-1", children: "Overall resume quality score" }),
                /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 mt-4", children: analysis.sections && Object.entries(analysis.sections).map(([key, val]) => /* @__PURE__ */ jsx("span", { className: `text-xs font-bold px-3 py-1 rounded-full ${val ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400 line-through"}`, children: key.charAt(0).toUpperCase() + key.slice(1) }, key)) })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: analysis.scores && [
              { key: "ats", label: "ATS Compatibility", icon: "filter_alt" },
              { key: "impact", label: "Impact & Metrics", icon: "trending_up" },
              { key: "skills", label: "Skills Coverage", icon: "code" },
              { key: "clarity", label: "Clarity & Format", icon: "format_align_left" },
              { key: "completeness", label: "Completeness", icon: "checklist" },
              { key: "industry_fit", label: "Industry Fit", icon: "work" }
            ].map(({ key, label, icon }) => /* @__PURE__ */ jsx(ScoreBar, { label, score: analysis.scores[key], icon }, key)) })
          ] }),
          ((_a = analysis.suggestions) == null ? void 0 : _a.length) > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
            /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold mb-6 flex items-center gap-3", children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-amber-500", style: { fontVariationSettings: "'FILL' 1" }, children: "lightbulb" }),
              "Improvement Suggestions"
            ] }),
            /* @__PURE__ */ jsx("div", { className: "space-y-3", children: analysis.suggestions.map((s, i) => /* @__PURE__ */ jsx(SuggestionCard, { type: s.type, category: s.category, message: s.message }, i)) })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "bg-gradient-to-r from-emerald-500 to-sky-500 rounded-3xl p-8 text-white", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-3xl opacity-80", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold mb-1", children: "Take it further with Resume Forge" }),
              /* @__PURE__ */ jsx("p", { className: "text-white/80 text-sm mb-4", children: "Paste a job description and let AI rewrite your resume to maximise your match score for that specific role." }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: () => setActiveTab("forge"),
                  className: "bg-white text-emerald-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors flex items-center gap-2",
                  children: [
                    /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
                    "Open Forge Tab"
                  ]
                }
              )
            ] })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "lg:col-span-1", children: /* @__PURE__ */ jsx("div", { className: "glass-card rounded-3xl p-8 sticky top-8", children: /* @__PURE__ */ jsx(RecentUploads, { resumes: recentResumes, onResumeClick: handleResumeClick, onDeleteClick: handleDeleteClick }) }) })
    ] }),
    activeTab === "forge" && (() => {
      var _a2, _b, _c, _d, _e;
      const resultToRender = forgeMode === "optimize" ? forgeResult : createResult;
      const isLoading = forgeMode === "optimize" ? forging : creating;
      return /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-4 flex gap-2", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setForgeMode("optimize"),
              className: `flex-1 py-3 px-6 rounded-2xl font-bold flex justify-center items-center gap-3 transition-all duration-200 ${forgeMode === "optimize" ? "bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"}`,
              children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
                "Optimize Existing Resume"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setForgeMode("create"),
              className: `flex-1 py-3 px-6 rounded-2xl font-bold flex justify-center items-center gap-3 transition-all duration-200 ${forgeMode === "create" ? "bg-sky-50 text-sky-700 shadow-sm border border-sky-100" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"}`,
              children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 1" }, children: "note_add" }),
                "Create New Resume"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "glass-card rounded-3xl p-8", children: forgeMode === "optimize" ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-xl font-bold mb-2 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
            "Forge Resume for a Job"
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant text-sm mb-6", children: "Upload your resume and paste the job description. The system will calculate ATS match and generate a deterministic optimized version." }),
          forgeError && /* @__PURE__ */ jsxs("div", { className: "mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-red-500 shrink-0", children: "error" }),
            forgeError
          ] }),
          /* @__PURE__ */ jsxs("form", { onSubmit: handleForge, className: "space-y-6", children: [
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("label", { className: "block text-sm font-bold text-on-surface mb-2", children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm align-middle mr-1", style: { fontVariationSettings: "'FILL' 0" }, children: "upload_file" }),
                  "Your Resume (PDF / DOCX)"
                ] }),
                /* @__PURE__ */ jsxs(
                  "div",
                  {
                    onDrop: handleForgeDrop,
                    onDragOver: (e) => {
                      e.preventDefault();
                      forgeDrop.current = true;
                    },
                    onDragLeave: () => {
                      forgeDrop.current = false;
                    },
                    onClick: () => document.getElementById("forge-file-input").click(),
                    className: "border-2 border-dashed border-outline/30 hover:border-emerald-400/70 hover:bg-emerald-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200",
                    children: [
                      /* @__PURE__ */ jsx(
                        "input",
                        {
                          id: "forge-file-input",
                          type: "file",
                          accept: ".pdf,.doc,.docx",
                          className: "hidden",
                          onChange: (e) => {
                            var _a3;
                            return setForgeFile(((_a3 = e.target.files) == null ? void 0 : _a3[0]) || null);
                          }
                        }
                      ),
                      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-4xl text-outline/40 mb-2 block", style: { fontVariationSettings: "'FILL' 0" }, children: forgeFile ? "description" : "cloud_upload" }),
                      forgeFile ? /* @__PURE__ */ jsxs("div", { children: [
                        /* @__PURE__ */ jsx("p", { className: "font-bold text-on-surface text-sm", children: forgeFile.name }),
                        /* @__PURE__ */ jsxs("p", { className: "text-xs text-on-surface-variant mt-0.5", children: [
                          (forgeFile.size / 1024).toFixed(0),
                          " KB · Click to change"
                        ] })
                      ] }) : /* @__PURE__ */ jsxs("div", { children: [
                        /* @__PURE__ */ jsx("p", { className: "font-semibold text-on-surface text-sm", children: "Drop file or click to browse" }),
                        /* @__PURE__ */ jsx("p", { className: "text-xs text-on-surface-variant mt-0.5", children: "PDF, DOC, DOCX" })
                      ] })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("label", { className: "block text-sm font-bold text-on-surface mb-2", children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm align-middle mr-1", style: { fontVariationSettings: "'FILL' 0" }, children: "work" }),
                  "Job Description",
                  /* @__PURE__ */ jsxs("span", { className: "text-xs font-normal text-on-surface-variant ml-2", children: [
                    jobDescription.split(/\s+/).filter(Boolean).length,
                    " words"
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    rows: 10,
                    placeholder: "Paste the full job description here — include required skills, responsibilities, and qualifications for the best ATS match...",
                    className: "w-full bg-surface-container border border-outline/20 rounded-2xl px-4 py-3 font-medium text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-sm leading-relaxed",
                    value: jobDescription,
                    onChange: (e) => setJobDescription(e.target.value)
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "mt-3", children: [
                  /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Download Format" }),
                  /* @__PURE__ */ jsxs(
                    "select",
                    {
                      className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500",
                      value: optimizeOutputFormat,
                      onChange: (e) => setOptimizeOutputFormat(e.target.value),
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "docx", children: "DOCX" }),
                        /* @__PURE__ */ jsx("option", { value: "pdf", children: "PDF" })
                      ]
                    }
                  )
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "submit",
                disabled: !forgeFile || !jobDescription.trim() || forging,
                className: "w-full py-4 bg-gradient-to-r from-emerald-500 to-sky-500 text-white font-bold rounded-2xl hover:from-emerald-600 hover:to-sky-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(16,185,129,0.35)] flex items-center justify-center gap-3 text-base",
                children: forging ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
                  "Forging your resume — this takes ~15 seconds..."
                ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
                  "Forge Resume for This Job"
                ] })
              }
            )
          ] })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4", children: /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("h2", { className: "text-xl font-bold mb-2 flex items-center gap-3", children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sky-600", style: { fontVariationSettings: "'FILL' 1" }, children: "note_add" }),
              "Create Resume from Scratch"
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant text-sm", children: "Fill in your details and generate a professional resume (no AI rewriting) with ATS-friendly structure for your target role." })
          ] }) }),
          createError && /* @__PURE__ */ jsxs("div", { className: "mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-red-500 shrink-0", children: "error" }),
            createError
          ] }),
          /* @__PURE__ */ jsxs("form", { onSubmit: handleCreateResume, className: "space-y-6", children: [
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
              /* @__PURE__ */ jsxs("div", { className: "md:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Full Name *" }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      required: true,
                      type: "text",
                      className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500",
                      value: createFormData.fullName,
                      onChange: (e) => setCreateFormData({ ...createFormData, fullName: e.target.value })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Email" }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "email",
                      className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500",
                      value: createFormData.email,
                      onChange: (e) => setCreateFormData({ ...createFormData, email: e.target.value })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Phone" }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "tel",
                      className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500",
                      value: createFormData.phone,
                      onChange: (e) => setCreateFormData({ ...createFormData, phone: e.target.value })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Target Job Title" }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "text",
                      className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500",
                      value: createFormData.targetJobTitle,
                      onChange: (e) => setCreateFormData({ ...createFormData, targetJobTitle: e.target.value })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Output Format" }),
                  /* @__PURE__ */ jsxs(
                    "select",
                    {
                      className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500",
                      value: createFormData.outputFormat,
                      onChange: (e) => setCreateFormData({ ...createFormData, outputFormat: e.target.value }),
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "docx", children: "DOCX" }),
                        /* @__PURE__ */ jsx("option", { value: "pdf", children: "PDF" })
                      ]
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1 text-emerald-600", children: "Target Job Description *" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    required: true,
                    rows: 5,
                    placeholder: "Paste the JD here...",
                    className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y",
                    value: createFormData.targetJobDescription,
                    onChange: (e) => setCreateFormData({ ...createFormData, targetJobDescription: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Experience" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    rows: 5,
                    placeholder: "Job titles, companies, dates, achievements...",
                    className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y",
                    value: createFormData.experience,
                    onChange: (e) => setCreateFormData({ ...createFormData, experience: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Professional Summary & Skills" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    rows: 4,
                    placeholder: "Brief summary and list of key skills...",
                    className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y",
                    value: createFormData.summary,
                    onChange: (e) => setCreateFormData({ ...createFormData, summary: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Skills" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    rows: 4,
                    placeholder: "Comma or newline separated skills...",
                    className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y",
                    value: createFormData.skills,
                    onChange: (e) => setCreateFormData({ ...createFormData, skills: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Education" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    rows: 4,
                    placeholder: "Degrees, schools, notable coursework...",
                    className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y",
                    value: createFormData.education,
                    onChange: (e) => setCreateFormData({ ...createFormData, education: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-on-surface mb-1", children: "Projects" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    rows: 4,
                    placeholder: "Project name, stack, outcomes...",
                    className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y",
                    value: createFormData.projects,
                    onChange: (e) => setCreateFormData({ ...createFormData, projects: e.target.value })
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "submit",
                disabled: !createFormData.fullName || !createFormData.targetJobDescription || creating,
                className: "w-full py-4 bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-bold rounded-2xl hover:from-sky-600 hover:to-indigo-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(14,165,233,0.35)] flex items-center justify-center gap-3 text-base",
                children: creating ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
                  "Crafting your resume..."
                ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "draw" }),
                  "Create Tailored Resume"
                ] })
              }
            )
          ] })
        ] }) }),
        resultToRender && !isLoading && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
            /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center", children: [
              /* @__PURE__ */ jsx(ATSRing, { score: resultToRender.atsScore, label: resultToRender.atsLabel }),
              /* @__PURE__ */ jsxs("p", { className: "text-sm text-on-surface-variant mt-4 max-w-[180px]", children: [
                resultToRender.totalJdKeywords,
                " tech keywords found in the job description"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
              /* @__PURE__ */ jsxs("h3", { className: "text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 1" }, children: "check_circle" }),
                "Optimized Keywords (",
                ((_a2 = resultToRender.matchedKeywords) == null ? void 0 : _a2.length) || 0,
                ")"
              ] }),
              /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: ((_b = resultToRender.matchedKeywords) == null ? void 0 : _b.length) > 0 ? resultToRender.matchedKeywords.map((kw) => /* @__PURE__ */ jsx(KeywordPill, { text: kw, variant: "match" }, kw)) : /* @__PURE__ */ jsx("p", { className: "text-xs text-on-surface-variant", children: "No matching keywords found." }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
              /* @__PURE__ */ jsxs("h3", { className: "text-sm font-bold text-red-700 mb-3 flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 0" }, children: "cancel" }),
                "Still Missing (",
                ((_c = resultToRender.missingKeywords) == null ? void 0 : _c.length) || 0,
                ")"
              ] }),
              /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: ((_d = resultToRender.missingKeywords) == null ? void 0 : _d.length) > 0 ? resultToRender.missingKeywords.map((kw) => /* @__PURE__ */ jsx(KeywordPill, { text: kw, variant: "missing" }, kw)) : /* @__PURE__ */ jsx("p", { className: "text-xs text-emerald-700 font-semibold", children: "Your resume is a perfect keyword match!" }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "glass-card bg-slate-900/80 rounded-3xl overflow-hidden", children: [
            /* @__PURE__ */ jsxs("div", { className: "bg-slate-800 px-8 py-5 flex justify-between items-center", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-400 text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("h3", { className: "text-white font-bold text-base", children: "Final Resume" }),
                  /* @__PURE__ */ jsx("p", { className: "text-slate-400 text-xs", children: "Generated from your questionnaire details with ATS-first template logic" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsxs("span", { className: "text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full", children: [
                  resultToRender.atsScore,
                  "% ATS Match"
                ] }),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => {
                      const txt = resultToRender.tunedResume || resultToRender.generatedResume;
                      if (txt) {
                        navigator.clipboard.writeText(txt);
                        setCopiedReadme(true);
                        setTimeout(() => setCopiedReadme(false), 2e3);
                      }
                    },
                    className: "bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors flex items-center gap-2",
                    children: [
                      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: copiedReadme ? "check" : "content_copy" }),
                      copiedReadme ? "Copied!" : "Copy"
                    ]
                  }
                ),
                resultToRender.fileBase64 && /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => handleDownloadGenerated(resultToRender),
                    className: "bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors flex items-center gap-2",
                    children: [
                      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm", style: { fontVariationSettings: "'FILL' 1" }, children: "download" }),
                      "Download ",
                      ((_e = resultToRender.outputFormat) == null ? void 0 : _e.toUpperCase()) || "FILE"
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "p-8 max-h-[600px] overflow-y-auto", children: /* @__PURE__ */ jsx("pre", { className: "text-slate-200 font-mono text-sm whitespace-pre-wrap leading-relaxed", children: resultToRender.tunedResume || resultToRender.generatedResume || "No resume text generated." }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "glass-card border-emerald-200/50 rounded-2xl p-6 flex gap-4", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600 text-xl shrink-0 mt-0.5", style: { fontVariationSettings: "'FILL' 1" }, children: "info" }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-emerald-800 mb-1", children: "How Resume Forge works" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-emerald-700 leading-relaxed", children: "Your factual details are assembled into a deterministic ATS-first resume structure. Job-description keywords are merged into the skill profile, then scored for alignment so you can export the result as DOCX or PDF." })
            ] })
          ] })
        ] })
      ] });
    })()
  ] });
}
const ALL_TOOLS = [
  // Learn & Build (₹199/month)
  { name: "Skill Assessment", icon: Activity, path: "/skills", color: "bg-blue-500", tier: "Foundation", plan: "Learn & Build" },
  { name: "Career Roadmap", icon: Map$1, path: "/career", color: "bg-teal-500", tier: "Foundation", plan: "Learn & Build" },
  { name: "Learning Hub", icon: BookOpen, path: "/learning", color: "bg-amber-500", tier: "Foundation", plan: "Learn & Build" },
  { name: "Project Builder", icon: Lightbulb, path: "/projects", color: "bg-rose-500", tier: "Foundation", plan: "Learn & Build" },
  { name: "Portfolio Builder", icon: Layout$1, path: "/portfolio", color: "bg-indigo-500", tier: "Foundation", plan: "Learn & Build" },
  // Tune & Polish (₹299/month)
  { name: "Resume Optimizer", icon: FileText, path: "/resume", color: "bg-emerald-500", tier: "Profile", plan: "Tune & Polish" },
  { name: "ATS Checker", icon: CheckCircle2, path: "/ats-checker", color: "bg-green-500", tier: "Profile", plan: "Tune & Polish" },
  { name: "LinkedIn Optimizer", icon: Linkedin, path: "/linkedin", color: "bg-sky-500", tier: "Profile", plan: "Tune & Polish" },
  { name: "GitHub Optimizer", icon: Github, path: "/github", color: "bg-slate-900", tier: "Profile", plan: "Tune & Polish" },
  { name: "Recruiter Visibility Checker", icon: Gauge, path: "/recruiter-visibility", color: "bg-fuchsia-500", tier: "Profile", plan: "Tune & Polish" },
  { name: "Application Assistant", icon: FileText, path: "/cover-letter", color: "bg-orange-500", tier: "Profile", plan: "Tune & Polish" },
  { name: "Job Discovery", icon: Search, path: "/discover", color: "bg-cyan-500", tier: "Profile", plan: "Tune & Polish" },
  // Zero To Hero (₹499/month)
  { name: "Interview Prep", icon: Zap, path: "/interview", color: "bg-purple-500", tier: "Advanced", plan: "Zero to Hero" },
  { name: "Job Analytics", icon: TrendingUp, path: "/jobs", color: "bg-cyan-700", tier: "Advanced", plan: "Zero to Hero" },
  { name: "Career Readiness Dashboard", icon: ListChecks, path: "/career-readiness", color: "bg-violet-600", tier: "Advanced", plan: "Zero to Hero" },
  { name: "Evidence Dashboard", icon: ListChecks, path: "/evidence", color: "bg-indigo-700", tier: "Advanced", plan: "Zero to Hero" },
  { name: "Job Fit Analysis", icon: Target, path: "/job-fit", color: "bg-pink-600", tier: "Advanced", plan: "Zero to Hero" },
  { name: "Job Description Analyzer", icon: ListChecks, path: "/job-analyzer", color: "bg-stone-600", tier: "Advanced", plan: "Zero to Hero" }
];
const PLAN_TIERS = {
  "Learn & Build": 1,
  "Tune & Polish": 2,
  "Zero to Hero": 3
};
function Dashboard() {
  var _a;
  const { user, isAuthenticated } = useAuthStore();
  const { userPlan, getUserPlan } = useSubscriptionStore();
  const [overview, setOverview] = useState(null);
  const [visibleTools, setVisibleTools] = useState([]);
  useEffect(() => {
    getUserPlan();
    api.get("/dashboard/overview").then(({ data }) => setOverview(data)).catch(() => {
    });
  }, []);
  useEffect(() => {
    if (userPlan) {
      const userTier = PLAN_TIERS[userPlan.name] || 0;
      const available = ALL_TOOLS.filter((tool) => {
        const toolTier = PLAN_TIERS[tool.plan] || 0;
        return toolTier <= userTier;
      });
      setVisibleTools(available);
    } else {
      const available = ALL_TOOLS.filter((tool) => PLAN_TIERS[tool.plan] === 1);
      setVisibleTools(available);
    }
  }, [userPlan]);
  if (!isAuthenticated) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  return /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 w-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-widest mb-2", children: [
          /* @__PURE__ */ jsx(Zap, { className: "w-4 h-4 fill-current" }),
          " Ecosystem Dashboard"
        ] }),
        /* @__PURE__ */ jsxs("h1", { className: "text-4xl font-black text-slate-900 tracking-tight", children: [
          "Hello, ",
          ((_a = user == null ? void 0 : user.email) == null ? void 0 : _a.split("@")[0]) || "Professional",
          "!"
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-slate-500 mt-2 font-medium", children: [
          "Your plan: ",
          /* @__PURE__ */ jsx("span", { className: "font-bold text-blue-600", children: (userPlan == null ? void 0 : userPlan.name) || "Loading..." }),
          userPlan && /* @__PURE__ */ jsxs("span", { className: "text-emerald-600 ml-2", children: [
            "• ",
            visibleTools.length,
            " tools available"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3", children: [
        userPlan && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 glass-card p-4 rounded-2xl", children: [
          /* @__PURE__ */ jsx(Crown, { className: "w-5 h-5 text-amber-500" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 font-bold uppercase tracking-tighter", children: "Current Plan" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm font-black text-slate-900", children: userPlan.name })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 glass-card p-2 rounded-2xl", children: [
          /* @__PURE__ */ jsx("div", { className: "flex -space-x-2 px-2", children: [1, 2, 3].map((i) => /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden", children: /* @__PURE__ */ jsx("img", { src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 42}`, alt: "User" }) }, i)) }),
          /* @__PURE__ */ jsx("div", { className: "h-8 w-px bg-slate-100 mx-2" }),
          /* @__PURE__ */ jsxs("div", { className: "pr-4", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 font-bold uppercase tracking-tighter", children: "Your Network" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm font-black text-slate-900", children: "+124 Peers" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12", children: [
      { label: "Readiness Score", val: overview ? `${overview.readinessScore}/100` : "45/100", icon: Target, color: "text-blue-600", bg: "bg-blue-50" },
      { label: "Skills Verified", val: overview ? `${overview.skillScore}/100` : "60/100", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
      { label: "Resume Score", val: overview ? `${overview.resumeScore}/100` : "70/100", icon: Star, color: "text-amber-600", bg: "bg-amber-50" },
      { label: "Interviews Done", val: overview ? overview.interviewsCompleted || "0" : "0", icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" }
    ].map((stat, i) => /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl flex items-center gap-5 group transition-colors", children: [
      /* @__PURE__ */ jsx("div", { className: `w-14 h-14 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`, children: /* @__PURE__ */ jsx(stat.icon, { className: "w-7 h-7" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-slate-400 uppercase tracking-widest", children: stat.label }),
        /* @__PURE__ */ jsx("p", { className: "text-2xl font-black text-slate-900 tracking-tight", children: stat.val })
      ] })
    ] }, i)) }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-2xl font-black text-slate-900 tracking-tight", children: [
            "Your Tool Ecosystem (",
            visibleTools.length,
            ")"
          ] }),
          /* @__PURE__ */ jsxs(Link, { to: "/", className: "text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline", children: [
            "View Introduction ",
            /* @__PURE__ */ jsx(ExternalLink, { className: "w-3 h-3" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: ALL_TOOLS.map((tool, i) => {
          const isAvailable = visibleTools.some((t) => t.name === tool.name);
          return isAvailable ? /* @__PURE__ */ jsxs(Link, { to: tool.path, className: "group flex items-center justify-between p-6 glass-card rounded-3xl transition-all duration-300 hover:shadow-lg", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ jsx("div", { className: `w-12 h-12 ${tool.color} rounded-xl flex items-center justify-center text-white shadow-lg`, children: /* @__PURE__ */ jsx(tool.icon, { className: "w-6 h-6" }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-[10px] font-black uppercase tracking-tighter text-slate-400", children: tool.tier }),
                /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 group-hover:text-blue-600 transition-colors", children: tool.name })
              ] })
            ] }),
            /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" })
          ] }, i) : /* @__PURE__ */ jsxs(
            "div",
            {
              className: "flex items-center justify-between p-6 glass-card rounded-3xl cursor-not-allowed opacity-50",
              title: `Available in ${tool.plan} plan or higher`,
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
                  /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400", children: /* @__PURE__ */ jsx(tool.icon, { className: "w-6 h-6" }) }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsxs("p", { className: "text-[10px] font-black uppercase tracking-tighter text-slate-400 flex items-center gap-1", children: [
                      tool.tier,
                      " ",
                      /* @__PURE__ */ jsx(Lock, { className: "w-2.5 h-2.5" })
                    ] }),
                    /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-400", children: tool.name }),
                    /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-400 mt-1", children: [
                      tool.plan,
                      "+"
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsx(Lock, { className: "w-5 h-5 text-slate-300" })
              ]
            },
            i
          );
        }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-2xl font-black text-slate-900 tracking-tight", children: "Priority Actions" }),
        /* @__PURE__ */ jsxs("div", { className: "glass-panel border border-white/20 dark:border-white/10 rounded-[2.5rem] p-8 text-slate-900 dark:text-white relative overflow-hidden", children: [
          /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 p-4 opacity-10", children: /* @__PURE__ */ jsx(Zap, { className: "w-32 h-32 text-blue-400" }) }),
          /* @__PURE__ */ jsxs("div", { className: "relative z-10 space-y-6", children: [
            /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider", children: "Walkthrough Guide" }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
                /* @__PURE__ */ jsx("div", { className: "w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black border-2 border-slate-100 dark:border-slate-900 shrink-0 relative z-20 text-white", children: "1" }),
                /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug", children: [
                  "Complete the ",
                  /* @__PURE__ */ jsx("span", { className: "text-slate-900 dark:text-white font-bold", children: "Technical Assessment" }),
                  " to unlock your learning path."
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
                /* @__PURE__ */ jsx("div", { className: "w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black border-2 border-slate-100 dark:border-slate-900 shrink-0 relative z-20 text-slate-600 dark:text-slate-400", children: "2" }),
                /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-slate-600 dark:text-slate-400 leading-snug", children: [
                  "Optimize your ",
                  /* @__PURE__ */ jsx("span", { className: "text-slate-800 dark:text-white/60 font-bold", children: "LinkedIn Headline" }),
                  " based on suggested keywords."
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs(Link, { to: "/skills", className: "flex items-center justify-center gap-2 w-full py-4 glass-card text-slate-900 rounded-2xl font-black hover:bg-white/80 transition-all active:scale-95 text-sm", children: [
              "Continue Placement Path ",
              /* @__PURE__ */ jsx(ArrowRight, { className: "w-4 h-4" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-6", children: [
            /* @__PURE__ */ jsx("h4", { className: "font-black text-slate-900 tracking-tight", children: "Recent Activity" }),
            /* @__PURE__ */ jsx(Clock, { className: "w-4 h-4 text-slate-400" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-6", children: ((overview == null ? void 0 : overview.recentActivity) ?? [
            { id: 1, action: "Skills Verified: React.js", date: "2h ago" },
            { id: 2, action: "Resume Scored 85/100", date: "1d ago" },
            { id: 3, action: "Ecosystem Initialized", date: "2d ago" }
          ]).map((act, i) => /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
            /* @__PURE__ */ jsx("div", { className: "w-1.5 h-1.5 rounded-full bg-blue-500 mt-2" }),
            /* @__PURE__ */ jsxs("div", { className: "flex-grow", children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-slate-800 leading-none", children: act.action }),
              /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tighter", children: act.date })
            ] })
          ] }, act.id ?? i)) })
        ] })
      ] })
    ] })
  ] });
}
function Login() {
  const { login, signup, isAuthenticated, isLoading, error, accountInUse, clearAccountInUse } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: "", password: "", github_username: "" });
  const [localError, setLocalError] = useState("");
  if (isAuthenticated) {
    return /* @__PURE__ */ jsx(Navigate, { to: "/dashboard", replace: true });
  }
  const redirectAfterAuth = () => {
    setTimeout(() => {
      window.location.href = "/onboarding";
    }, 500);
  };
  const handleSubmit = async (e, replaceDevice = false) => {
    e.preventDefault();
    setLocalError("");
    clearAccountInUse();
    try {
      if (isLogin) {
        await login(
          { email: formData.email, password: formData.password },
          { replaceDevice }
        );
        redirectAfterAuth();
      } else {
        await signup(formData);
        redirectAfterAuth();
      }
    } catch (err) {
      if (err.code === "ACCOUNT_IN_USE") return;
      setLocalError("Authentication failed. Please verify your credentials.");
    }
  };
  const handleReplaceDevice = (e) => {
    handleSubmit(e, true);
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full min-h-screen flex flex-col lg:flex-row bg-white dark:bg-slate-950", children: [
    /* @__PURE__ */ jsxs("div", { className: "hidden lg:flex lg:w-1/2 relative flex-col justify-center px-12 lg:px-24 overflow-hidden bg-gradient-to-br from-[#4b5a96] to-[#3a477a] dark:from-blue-900 dark:to-indigo-950", children: [
      /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 pointer-events-none", children: [
        /* @__PURE__ */ jsx("div", { className: "absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-400/20 blur-[100px] rounded-full mix-blend-overlay" }),
        /* @__PURE__ */ jsx("div", { className: "absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-400/20 blur-[100px] rounded-full mix-blend-overlay" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relative z-10 space-y-12", children: [
        /* @__PURE__ */ jsxs(Link, { to: "/", className: "inline-flex items-center gap-2 mb-8 group", children: [
          /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-blue-500/30", children: /* @__PURE__ */ jsx(Briefcase, { className: "w-6 h-6 text-white" }) }),
          /* @__PURE__ */ jsx("span", { className: "text-2xl font-black text-white tracking-tighter", children: "JobTune" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-5xl font-extrabold text-white leading-tight", children: [
            "Your journey to ",
            /* @__PURE__ */ jsx("br", {}),
            /* @__PURE__ */ jsx("span", { className: "text-[#8bb4f7]", children: "FAANG" }),
            " begins here."
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-xl text-slate-400 font-light max-w-md", children: "One account, one active device — built to keep your preparation personal and secure." })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-6 pt-8", children: [
          { title: "Personalized Skill Gap Analysis", icon: Activity },
          { title: "ATS-Grade Resume Optimization", icon: Layout$1 },
          { title: "Curated Industry Learning Paths", icon: Sparkles }
        ].map((item, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-sm", children: [
          /* @__PURE__ */ jsx("div", { className: "w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400", children: /* @__PURE__ */ jsx(item.icon, { className: "w-5 h-5" }) }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-300 font-medium", children: item.title })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "absolute bottom-12 left-16 flex items-center gap-2 text-slate-500 text-sm", children: [
        /* @__PURE__ */ jsx(ShieldCheck, { className: "w-4 h-4 text-emerald-500" }),
        "Single-device session protection"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-24 relative bg-white dark:bg-slate-900", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full space-y-8 animate-in fade-in slide-in-from-right duration-500", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center lg:text-left space-y-2", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-4xl font-black text-slate-900 dark:text-white font-headline tracking-tight", children: isLogin ? "Welcome Back!" : "Create your Account" }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500 dark:text-slate-400 font-medium", children: isLogin ? "Pick up where you left off." : "Start your professional journey today." })
      ] }),
      accountInUse && /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "w-6 h-6 text-amber-600 shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 dark:text-white", children: "Account already in use" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-300 mt-1", children: "This account is active on another device. Sign-in from a second computer or IP is blocked to prevent account sharing." })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 text-sm", children: [
          /* @__PURE__ */ jsx(Monitor, { className: "w-5 h-5 text-slate-500 shrink-0" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "font-semibold text-slate-800 dark:text-slate-200", children: accountInUse.deviceName || "Another device" }),
            accountInUse.ipAddress && /* @__PURE__ */ jsxs("p", { className: "text-slate-500 text-xs mt-0.5", children: [
              "IP: ",
              accountInUse.ipAddress
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "If this is your device and you want to switch here, use the button below. The other session will be signed out immediately." }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: handleReplaceDevice,
            disabled: isLoading,
            className: "w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50",
            children: isLoading ? "Switching device…" : "Use this device instead"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: clearAccountInUse,
            className: "w-full text-sm font-semibold text-slate-500 hover:text-slate-700",
            children: "Cancel"
          }
        )
      ] }),
      (error || localError) && !accountInUse && /* @__PURE__ */ jsxs("div", { className: "glass-card border-rose-200/50 p-4 rounded-xl text-rose-600 font-bold text-sm flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-rose-500" }),
        error || localError
      ] }),
      /* @__PURE__ */ jsxs("form", { className: "space-y-5", onSubmit: handleSubmit, children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
            /* @__PURE__ */ jsx(Mail, { className: "absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "email",
                required: true,
                placeholder: "Email Address",
                className: "w-full pl-12 pr-4 py-4 bg-[#f4f7fc] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#4255f4]/50 focus:border-[#4255f4] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium",
                value: formData.email,
                onChange: (e) => setFormData({ ...formData, email: e.target.value })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
            /* @__PURE__ */ jsx(Lock, { className: "absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "password",
                required: true,
                placeholder: "Password",
                className: "w-full pl-12 pr-4 py-4 bg-[#f4f7fc] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#4255f4]/50 focus:border-[#4255f4] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium",
                value: formData.password,
                onChange: (e) => setFormData({ ...formData, password: e.target.value })
              }
            )
          ] }),
          !isLogin && /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
            /* @__PURE__ */ jsx(Github, { className: "absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                placeholder: "GitHub Username",
                className: "w-full pl-12 pr-4 py-4 bg-[#f4f7fc] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#4255f4]/50 focus:border-[#4255f4] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium",
                value: formData.github_username,
                onChange: (e) => setFormData({ ...formData, github_username: e.target.value })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "submit",
            disabled: isLoading || !!accountInUse,
            className: "w-full bg-[#4255f4] hover:bg-[#3244d6] text-white font-black py-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50",
            children: [
              isLoading ? "Authenticating..." : isLogin ? "Sign In" : "Create Account",
              /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center", children: /* @__PURE__ */ jsx("div", { className: "w-full border-t border-outline/10" }) }),
        /* @__PURE__ */ jsx("div", { className: "relative flex justify-center text-sm", children: /* @__PURE__ */ jsx("span", { className: "px-4 py-1 bg-white dark:bg-slate-900 rounded-full text-slate-400 dark:text-slate-500 text-xs font-bold", children: "New to the Ecosystem?" }) })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setIsLogin(!isLogin),
          className: "w-full py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm",
          children: isLogin ? "Create an Account" : "Return to Login"
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "text-center text-xs text-on-surface-variant font-medium px-8", children: "By joining, you agree to our Terms of Service and single-device session policy." })
    ] }) })
  ] });
}
const FALLBACK_RESOURCES = [
  { id: 1, title: "Complete React Guide 2026", type: "Video", duration: "12 Hours", category: "Frontend", color: "#3b82f6" },
  { id: 2, title: "System Design Interview Prep", type: "Article", duration: "45 Mins", category: "Backend", color: "#8b5cf6" },
  { id: 3, title: "Advanced SQL Patterns", type: "Interactive", duration: "2 Hours", category: "Database", color: "#10b981" },
  { id: 4, title: "Mastering the Behavioral Interview", type: "Course", duration: "3 Hours", category: "Soft Skills", color: "#f59e0b" },
  { id: 5, title: "TypeScript for JavaScript Developers", type: "Video", duration: "4 Hours", category: "Frontend", color: "#3b82f6" },
  { id: 6, title: "Docker & Kubernetes Basics", type: "Article", duration: "1.5 Hours", category: "DevOps", color: "#ef4444" }
];
const TYPE_COLORS = { Video: "#3b82f6", Article: "#8b5cf6", Interactive: "#10b981", Course: "#f59e0b" };
function ContentVault() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [resources, setResources] = useState(FALLBACK_RESOURCES);
  const categories = ["All", "Frontend", "Backend", "Database", "Soft Skills", "DevOps"];
  useEffect(() => {
    api.get("/learning/resources").then(({ data }) => {
      if (Array.isArray(data) && data.length > 0) {
        setResources(data.map((r) => ({ ...r, color: TYPE_COLORS[r.type] || "#6366f1" })));
      }
    }).catch(() => {
    });
  }, []);
  const filtered = resources.filter((r) => {
    const matchesFilter = filter === "All" || r.category === filter;
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase()) || r.type.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-7xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-4xl font-black text-on-surface font-headline mb-3 flex items-center gap-4", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-amber-500 text-4xl", style: { fontVariationSettings: "'FILL' 0" }, children: "library_books" }),
          "Content Vault"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-md", children: "Access your personalized learning paths and curated resources designed to close your skill gaps." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relative w-full lg:w-auto", children: [
        /* @__PURE__ */ jsx("div", { className: "absolute left-4 top-1/2 -translate-y-1/2", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-outline text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "search" }) }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            placeholder: "Search resources...",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            className: "w-full lg:w-80 pl-12 pr-6 py-4 bg-surface-container/50 border border-outline/20 rounded-2xl focus:ring-2 focus:ring-amber-500/20 outline-none font-medium text-on-surface placeholder:text-outline"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex gap-3 overflow-x-auto pb-4 mb-12", children: categories.map((c) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => setFilter(c),
        className: `px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all duration-200 ${filter === c ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "glass-card hover:bg-white/40 text-on-surface transition-all"}`,
        children: c
      },
      c
    )) }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", children: filtered.map((item) => /* @__PURE__ */ jsxs("div", { className: "group glass-card rounded-3xl p-6 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden", children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
          style: { background: `linear-gradient(90deg, ${item.color} 0%, ${item.color}80 100%)` }
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-6", children: [
        /* @__PURE__ */ jsx("span", { className: "px-4 py-2 glass-panel border border-outline/10 text-on-surface-variant text-xs font-bold rounded-xl uppercase tracking-wider", children: item.category }),
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: "w-10 h-10 rounded-xl flex items-center justify-center",
            style: { background: item.color + "20" },
            children: [
              item.type === "Video" && /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined", style: { color: item.color, fontVariationSettings: "'FILL' 0" }, children: "play_circle" }),
              item.type === "Article" && /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined", style: { color: item.color, fontVariationSettings: "'FILL' 0" }, children: "article" }),
              item.type === "Interactive" && /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined", style: { color: item.color, fontVariationSettings: "'FILL' 0" }, children: "code" }),
              item.type === "Course" && /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined", style: { color: item.color, fontVariationSettings: "'FILL' 0" }, children: "school" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface mb-3 font-headline group-hover:text-amber-600 transition-colors leading-tight", children: item.title }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-6", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-outline", children: item.duration }),
        /* @__PURE__ */ jsx("span", { className: "text-outline", children: "•" }),
        /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-outline", children: item.type })
      ] }),
      /* @__PURE__ */ jsxs("button", { className: "w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold rounded-2xl hover:from-amber-600 hover:to-amber-700 active:scale-95 transition-all duration-200 shadow-lg flex items-center justify-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: "play_arrow" }),
        "Start Learning"
      ] })
    ] }, item.id)) }),
    filtered.length === 0 && /* @__PURE__ */ jsxs("div", { className: "text-center py-16", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-outline text-6xl mb-4 block", style: { fontVariationSettings: "'FILL' 0" }, children: "search_off" }),
      /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface mb-2", children: "No resources found" }),
      /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant", children: "Try adjusting your search or filter criteria" })
    ] })
  ] });
}
const BlogPost = {
  1: {
    id: 1,
    title: "Why AI Resume Optimization is Changing the Job Search Game",
    author: "JobTube Team",
    date: "April 20, 2026",
    category: "Resume Tips",
    excerpt: "Discover how AI-powered resume analysis improves ATS scores and lands more interviews.",
    readTime: "5 min read",
    image: "bg-gradient-to-br from-blue-500 to-blue-600",
    content: `
      <h2 class="text-2xl font-bold mb-4">Why AI Resume Optimization is Changing the Job Search Game</h2>

      <p class="mb-4 text-lg">Freshers often struggle with one fundamental question: "Will my resume even get past the first filter?" In today's job market, most companies use Applicant Tracking Systems (ATS) to scan resumes before a human ever sees them.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The ATS Problem</h3>
      <p class="mb-4">ATS systems look for specific keywords, formatting, and structure. A beautifully designed resume in Canva? It might fail to parse. Missing industry keywords? Instant rejection, no matter your experience.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">How AI Changes the Game</h3>
      <p class="mb-4">AI resume optimizers analyze your content against job descriptions, identify missing keywords, suggest formatting improvements, and provide real-time ATS scoring. This means:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Understand what keywords your industry cares about</li>
        <li>See exactly why your resume scored 65/100 and how to hit 95</li>
        <li>Get actionable feedback in seconds, not weeks</li>
        <li>Track improvements across multiple resume versions</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Real Impact</h3>
      <p class="mb-4">Users of JobTube's Resume Optimizer report a 40% increase in interview calls within the first month. Why? Because they're tailoring resumes to what hiring systems actually value—not what looks good on paper.</p>

      <p class="mt-6 text-sm text-slate-500">Share this article to help a fresher ace their resume.</p>
    `
  },
  2: {
    id: 2,
    title: "Mock Interviews: The Secret Weapon for Job Interview Success",
    author: "Sarah Chen",
    date: "April 18, 2026",
    category: "Interview Prep",
    excerpt: "Learn how AI-powered mock interviews build confidence and improve your STAR method technique.",
    readTime: "6 min read",
    image: "bg-gradient-to-br from-purple-500 to-purple-600",
    content: `
      <h2 class="text-2xl font-bold mb-4">Mock Interviews: The Secret Weapon for Job Interview Success</h2>

      <p class="mb-4 text-lg">Imagine this: It's your dream job interview. You're asked "Tell me about a time you failed." Your mind goes blank. You stammer. You lose the job.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">Why Mock Interviews Matter</h3>
      <p class="mb-4">Real interviews are high-pressure. Your first attempt shouldn't be on the actual job you want. Mock interviews let you practice in a low-stakes environment where feedback is instant and judgment-free.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The STAR Method Advantage</h3>
      <p class="mb-4">Most job interview questions are behavioral: "Tell me about a time..." The STAR method (Situation, Task, Action, Result) is the golden standard. JobTube's AI interviewer doesn't just ask questions—it scores your answers using STAR methodology:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li><strong>Situation:</strong> Did you set up context?</li>
        <li><strong>Task:</strong> What was the challenge?</li>
        <li><strong>Action:</strong> What did YOU do?</li>
        <li><strong>Result:</strong> What was the measurable outcome?</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">Real Results</h3>
      <p class="mb-4">Candidates who practice 5+ mock interviews report 60% higher confidence in real interviews. They know their stories. They know their strengths. And interviewers feel that confidence.</p>

      <p class="mt-6">Start practicing today. Your future self will thank you.</p>
    `
  },
  3: {
    id: 3,
    title: "LinkedIn Profile Optimization: From Invisible to Unstoppable",
    author: "Raj Patel",
    date: "April 16, 2026",
    category: "Career Growth",
    excerpt: "Transform your LinkedIn profile into a recruitment magnet with data-driven optimization strategies.",
    readTime: "7 min read",
    image: "bg-gradient-to-br from-indigo-500 to-indigo-600",
    content: `
      <h2 class="text-2xl font-bold mb-4">LinkedIn Profile Optimization: From Invisible to Unstoppable</h2>

      <p class="mb-4 text-lg">LinkedIn is where recruiters hunt for talent. But most fresher profiles are incomplete, generic, or buried in search results. Here's how to become visible—and unforgettable.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The LinkedIn Visibility Problem</h3>
      <p class="mb-4">LinkedIn's algorithm prioritizes profiles that:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Include industry-specific keywords (found in job descriptions you target)</li>
        <li>Have a strong headline (not just "Student at XYZ")</li>
        <li>Use a professional photo with good lighting and neutral background</li>
        <li>Have a populated "About" section with personality and purpose</li>
        <li>Show consistent activity (posts, comments, engagement)</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Optimization Playbook</h3>
      <p class="mb-4">JobTube's LinkedIn Optimizer analyzes your profile and recommends specific improvements:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Better headline keywords for your target role</li>
        <li>About section rewrite with impact metrics</li>
        <li>Key skills to add (backed by job market data)</li>
        <li>Experience section wording that resonates</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">What Happens Next</h3>
      <p class="mb-4">Within 2 weeks of implementing optimizations, most users report:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Increased recruiter messages (2-3x)</li>
        <li>More profile views from decision-makers</li>
        <li>Higher connection acceptance rates</li>
      </ul>

      <p class="mt-6">Your LinkedIn profile is your personal brand. Make it count.</p>
    `
  },
  4: {
    id: 4,
    title: "GitHub for Career Growth: Making Your Code Work for You",
    author: "Maria Rodriguez",
    date: "April 14, 2026",
    category: "Developer Portfolio",
    excerpt: "Stop letting great code sit in private repos. Here's how to showcase your projects and land developer jobs.",
    readTime: "6 min read",
    image: "bg-gradient-to-br from-slate-600 to-slate-700",
    content: `
      <h2 class="text-2xl font-bold mb-4">GitHub for Career Growth: Making Your Code Work for You</h2>

      <p class="mb-4 text-lg">For developers, GitHub is your portfolio. A strong GitHub profile can land interviews without a single line of resume text. But most fresher developers don't realize what makes a GitHub profile shine.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The Hidden Potential of GitHub</h3>
      <p class="mb-4">Hiring managers and recruiters now regularly check GitHub profiles. They want to see:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Public projects with clean, readable code</li>
        <li>Meaningful commit messages (not "fix bug" repeated 50 times)</li>
        <li>Well-written READMEs that explain what your project does</li>
        <li>Active contribution history (consistency matters)</li>
        <li>Projects that solve real problems</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">Common GitHub Mistakes</h3>
      <p class="mb-4">❌ Too many abandoned projects with no README</p>
      <p class="mb-4">❌ Private repositories (recruiters can't see your work)</p>
      <p class="mb-4">❌ Copied projects without attribution or personal contribution</p>
      <p class="mb-4">❌ No projects at all (relying entirely on coursework)</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The GitHub Optimizer Advantage</h3>
      <p class="mb-4">JobTube's GitHub Optimizer scans your profile and suggests:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Which projects to feature and how to improve their READMEs</li>
        <li>Missing documentation that would make projects more impressive</li>
        <li>Profile completeness gaps (bio, website link, location)</li>
        <li>Visibility improvements (pinned projects, README badges)</li>
      </ul>

      <p class="mt-6">Your code is your voice. Make it heard.</p>
    `
  },
  5: {
    id: 5,
    title: "From 10 Applications to 3 Interviews: The Job Tracker Strategy",
    author: "Alex Kim",
    date: "April 12, 2026",
    category: "Job Search",
    excerpt: "Organize your job search, track follow-ups, and measure what actually works with data-driven job tracking.",
    readTime: "5 min read",
    image: "bg-gradient-to-br from-emerald-500 to-emerald-600",
    content: `
      <h2 class="text-2xl font-bold mb-4">From 10 Applications to 3 Interviews: The Job Tracker Strategy</h2>

      <p class="mb-4 text-lg">Here's a depressing statistic: Most freshers apply to 50+ jobs and get 2-3 interviews. The problem? They apply blindly, forget to follow up, and never measure what works.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The Job Search Black Hole</h3>
      <p class="mb-4">Without tracking, your job search becomes a mess:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>You forget which companies you applied to</li>
        <li>You miss follow-up deadlines</li>
        <li>You repeat the same mistakes across applications</li>
        <li>You have no data on what resume version actually converts</li>
        <li>You get frustrated and give up</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Kanban Method</h3>
      <p class="mb-4">JobTube uses a Kanban board to visualize your pipeline:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li><strong>Applied:</strong> Submitted but no response</li>
        <li><strong>Interview:</strong> Got the interview, preparing</li>
        <li><strong>Offer:</strong> Negotiating terms</li>
        <li><strong>Rejected:</strong> Learning from rejection</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Power of Data</h3>
      <p class="mb-4">By tracking every application, you discover patterns:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Which resume gets better response rates?</li>
        <li>Which types of companies interview you more?</li>
        <li>What's your interview-to-offer rate?</li>
        <li>When should you follow up?</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Real Win</h3>
      <p class="mb-4">Candidates who track every application and follow up strategically go from 50 applications → 5 interviews → 2+ offers. Quality over quantity wins.</p>

      <p class="mt-6">Track. Learn. Optimize. Repeat.</p>
    `
  }
};
const BlogList = () => {
  const [selectedPost, setSelectedPost] = useState(null);
  if (selectedPost) {
    return /* @__PURE__ */ jsx("div", { className: "w-full max-w-4xl mx-auto py-16 px-4 sm:px-6", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setSelectedPost(null),
          className: "flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-8 font-bold transition",
          children: "← Back to Blog"
        }
      ),
      /* @__PURE__ */ jsxs("article", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsx("div", { className: `w-full h-64 rounded-lg mb-8 ${BlogPost[selectedPost].image}` }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-4 mb-6 text-sm text-on-surface-variant font-medium", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Calendar, { size: 16 }),
            BlogPost[selectedPost].date
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(User, { size: 16 }),
            BlogPost[selectedPost].author
          ] }),
          /* @__PURE__ */ jsx("span", { className: "px-3 py-1 glass-panel text-on-surface-variant rounded-full text-xs font-bold", children: BlogPost[selectedPost].category }),
          /* @__PURE__ */ jsx("span", { className: "text-on-surface-variant", children: BlogPost[selectedPost].readTime })
        ] }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "prose max-w-none text-on-surface prose-headings:text-on-surface prose-strong:text-on-surface",
            dangerouslySetInnerHTML: { __html: BlogPost[selectedPost].content }
          }
        )
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsx("div", { className: "w-full max-w-6xl mx-auto py-16 px-4 sm:px-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto px-6 py-20", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl md:text-5xl font-black text-on-surface font-headline mb-4", children: "JobTube Blog" }),
      /* @__PURE__ */ jsx("p", { className: "text-xl text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Career insights, job search strategies, and AI-powered optimization tips for freshers breaking into tech." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid md:grid-cols-2 gap-8", children: Object.values(BlogPost).map((post) => /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: () => setSelectedPost(post.id),
        className: "group cursor-pointer glass-card rounded-3xl overflow-hidden hover:shadow-lg hover:-translate-y-2 transition-all duration-300",
        children: [
          /* @__PURE__ */ jsx("div", { className: `w-full h-48 ${post.image} relative overflow-hidden`, children: /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-black/20 group-hover:bg-black/30 transition" }) }),
          /* @__PURE__ */ jsxs("div", { className: "p-6", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
              /* @__PURE__ */ jsx("span", { className: "px-2 py-1 glass-panel text-on-surface-variant rounded text-xs font-bold", children: post.category }),
              /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-on-surface-variant", children: post.readTime })
            ] }),
            /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-on-surface font-headline mb-3 group-hover:text-sky-600 transition", children: post.title }),
            /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium mb-4 text-sm line-clamp-2", children: post.excerpt }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between pt-4 border-t border-outline/10", children: [
              /* @__PURE__ */ jsxs("div", { className: "text-xs font-bold text-on-surface-variant uppercase tracking-wider", children: [
                post.date,
                " • ",
                post.author
              ] }),
              /* @__PURE__ */ jsx(
                ArrowRight,
                {
                  size: 16,
                  className: "text-sky-600 group-hover:translate-x-1 transition-transform"
                }
              )
            ] })
          ] })
        ]
      },
      post.id
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-20 glass-card border-blue-200/50 rounded-3xl p-8", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-on-surface font-headline mb-4", children: "💡 Pro Tip: Start Here" }),
      /* @__PURE__ */ jsxs("p", { className: "text-on-surface-variant font-medium mb-6", children: [
        "First time optimizing your career? Start with ",
        /* @__PURE__ */ jsx("strong", { children: '"Why AI Resume Optimization..."' }),
        " and then move to ",
        /* @__PURE__ */ jsx("strong", { children: '"Mock Interviews."' }),
        " These two foundations will transform your job search in 30 days."
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setSelectedPost(1),
          className: "px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all inline-flex items-center gap-2",
          children: [
            "Read Article ",
            /* @__PURE__ */ jsx(ArrowRight, { size: 16 })
          ]
        }
      )
    ] })
  ] }) });
};
function getScoreColor$3(score) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#0ea5e9";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}
function LinkedInOptimizer() {
  const [formData, setFormData] = useState({
    headline: "",
    about: "",
    skills: "",
    experienceCount: 0,
    yearsOfExperience: 0,
    connections: "lt100",
    hasPhoto: false,
    hasFeatured: false
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const handleAnalyze = async (e) => {
    var _a, _b;
    e.preventDefault();
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const { data } = await api.post("/profiles/linkedin/analyze", formData);
      setReport(data);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-sky-500/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sky-600 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "group" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "LinkedIn Profile Optimizer" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Fill in your profile details for an instant score and actionable suggestions — no AI, no scraping required." })
    ] }),
    error && /* @__PURE__ */ jsx("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium", children: error }),
    /* @__PURE__ */ jsx("form", { onSubmit: handleAnalyze, className: "max-w-3xl mx-auto mb-16 space-y-4", children: /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-1", children: "Headline" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            maxLength: 220,
            placeholder: "e.g. Software Engineer | React & Node.js",
            className: "w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500",
            value: formData.headline,
            onChange: (e) => setFormData({ ...formData, headline: e.target.value })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "text-right text-xs text-outline mt-1", children: [
          formData.headline.length,
          "/220"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-1", children: "About / Summary" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            rows: 5,
            placeholder: "Write your LinkedIn summary here...",
            className: "w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-y",
            value: formData.about,
            onChange: (e) => setFormData({ ...formData, about: e.target.value })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "text-right text-xs text-outline mt-1", children: [
          formData.about.split(/\s+/).filter(Boolean).length,
          " words"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-1", children: "Skills" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            placeholder: "React, Node.js, Python...",
            className: "w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500",
            value: formData.skills,
            onChange: (e) => setFormData({ ...formData, skills: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-1", children: "Work/Project Experiences" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: 0,
              max: 20,
              className: "w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500",
              value: formData.experienceCount,
              onChange: (e) => setFormData({ ...formData, experienceCount: Number(e.target.value) })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-1", children: "Years of Experience" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: 0,
              max: 50,
              step: 0.5,
              className: "w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500",
              value: formData.yearsOfExperience,
              onChange: (e) => setFormData({ ...formData, yearsOfExperience: Number(e.target.value) })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-1", children: "Connections" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            className: "w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500",
            value: formData.connections,
            onChange: (e) => setFormData({ ...formData, connections: e.target.value }),
            children: [
              /* @__PURE__ */ jsx("option", { value: "lt100", children: "Less than 100" }),
              /* @__PURE__ */ jsx("option", { value: "100to500", children: "100 - 500" }),
              /* @__PURE__ */ jsx("option", { value: "500plus", children: "500+" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-6 pt-2", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              className: "w-5 h-5 rounded text-sky-600 focus:ring-sky-500 bg-surface-container border-outline/20",
              checked: formData.hasPhoto,
              onChange: (e) => setFormData({ ...formData, hasPhoto: e.target.checked })
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-sm font-bold text-on-surface", children: "Has Profile Photo" })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              className: "w-5 h-5 rounded text-sky-600 focus:ring-sky-500 bg-surface-container border-outline/20",
              checked: formData.hasFeatured,
              onChange: (e) => setFormData({ ...formData, hasFeatured: e.target.checked })
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-sm font-bold text-on-surface", children: "Has Featured Section" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "pt-6 border-t border-outline/10", children: /* @__PURE__ */ jsx(
        "button",
        {
          type: "submit",
          disabled: loading,
          className: "w-full bg-gradient-to-r from-sky-500 to-sky-600 text-white px-8 py-3 rounded-xl font-bold hover:from-sky-600 hover:to-sky-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-lg flex items-center justify-center gap-3",
          children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
            "Analyzing..."
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "analytics" }),
            "Analyze Profile"
          ] })
        }
      ) })
    ] }) }),
    loading && /* @__PURE__ */ jsx("div", { className: "max-w-3xl mx-auto text-center py-12", children: /* @__PURE__ */ jsxs("div", { className: "inline-flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-sky-500 text-5xl", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
      /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium", children: "AI is analyzing your LinkedIn profile..." })
    ] }) }),
    report && !loading && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl flex flex-col items-center justify-center text-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative mb-8", children: [
          /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 36 36", className: "w-32 h-32 -rotate-90 mx-auto", children: [
            /* @__PURE__ */ jsx("circle", { cx: "18", cy: "18", r: "15.9", fill: "none", stroke: "#e5eeff", strokeWidth: "3.2" }),
            /* @__PURE__ */ jsx(
              "circle",
              {
                cx: "18",
                cy: "18",
                r: "15.9",
                fill: "none",
                stroke: getScoreColor$3(report.score),
                strokeWidth: "3.2",
                strokeDasharray: `${report.score / 100 * 100} 100`,
                strokeLinecap: "round"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
            /* @__PURE__ */ jsx("span", { className: "text-4xl font-black text-on-surface", children: report.score }),
            /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-on-surface-variant uppercase tracking-wider", children: "/ 100" })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "inline-block px-4 py-1 rounded-full text-sm font-bold mb-3",
            style: { backgroundColor: `${getScoreColor$3(report.score)}20`, color: getScoreColor$3(report.score) },
            children: report.scoreLabel || "Profile Score"
          }
        ),
        /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-on-surface mb-3 font-headline", children: "Profile Score" }),
        /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium", children: report.scoreDescription || "See the breakdown below for actionable improvements." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-8 flex items-center gap-3 font-headline", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sky-600 text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "bar_chart" }),
          "Metrics Breakdown"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "space-y-6", children: report.metrics.map((m, i) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm font-bold mb-3", children: [
            /* @__PURE__ */ jsx("span", { className: "text-on-surface", children: m.label }),
            /* @__PURE__ */ jsxs("span", { className: "font-black", style: { color: getScoreColor$3(m.val) }, children: [
              m.val,
              "/100"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "w-full bg-surface-container/50 h-3 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx(
            "div",
            {
              className: "h-full rounded-full transition-all duration-700",
              style: {
                width: `${m.val}%`,
                backgroundColor: getScoreColor$3(m.val)
              }
            }
          ) })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 glass-card border-sky-500/20 p-8 rounded-3xl", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-sky-700 mb-8 flex items-center gap-3 font-headline", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sky-600 text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "lightbulb" }),
          "AI-Powered Suggestions"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: report.suggestions.map((s, i) => /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-2xl flex gap-4 items-start", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sky-600 text-lg mt-1 flex-shrink-0", style: { fontVariationSettings: "'FILL' 1" }, children: "check_circle" }),
          /* @__PURE__ */ jsx("p", { className: "text-on-surface font-medium leading-relaxed", children: s })
        ] }, i)) })
      ] })
    ] })
  ] });
}
function generateReadme(formData) {
  let markdown = "";
  if (formData.name) {
    markdown += `# Hi 👋, I'm ${formData.name}
`;
  }
  if (formData.tagline) {
    markdown += `### ${formData.tagline}
`;
  }
  markdown += "\n";
  const aboutItems = [];
  if (formData.currentWork) {
    aboutItems.push(`🔭 I'm currently working on **${formData.currentWork}**`);
  }
  if (formData.learning) {
    aboutItems.push(`🌱 I'm currently learning **${formData.learning}**`);
  }
  if (formData.askAbout) {
    aboutItems.push(`💬 Ask me about **${formData.askAbout}**`);
  }
  if (formData.email) {
    aboutItems.push(`📫 How to reach me: **${formData.email}**`);
  }
  if (formData.bio) {
    aboutItems.push(`✨ ${formData.bio}`);
  }
  if (aboutItems.length > 0) {
    markdown += "## About Me\n";
    aboutItems.forEach((item) => {
      markdown += `- ${item}
`;
    });
    markdown += "\n";
  }
  if (formData.skills && formData.skills.length > 0) {
    markdown += "## Skills & Languages\n";
    markdown += `\`\`\`
`;
    markdown += formData.skills.join(", ");
    markdown += `
\`\`\`

`;
  }
  if (formData.techStack) {
    markdown += "## Tech Stack\n";
    const stacks = formData.techStack.split(",").map((s) => s.trim()).filter(Boolean);
    const badges = stacks.map((tech) => {
      const slug = tech.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return `![${tech}](https://img.shields.io/badge/${slug}-000?style=flat&logo=${slug})`;
    }).join(" ");
    markdown += badges + "\n\n";
  }
  const socialLinks = [];
  if (formData.linkedin) {
    socialLinks.push(`[LinkedIn](${formData.linkedin})`);
  }
  if (formData.twitter) {
    socialLinks.push(`[Twitter](https://twitter.com/${formData.twitter})`);
  }
  if (formData.github) {
    socialLinks.push(`[GitHub](https://github.com/${formData.github})`);
  }
  if (formData.instagram) {
    socialLinks.push(`[Instagram](https://instagram.com/${formData.instagram})`);
  }
  if (formData.portfolio) {
    socialLinks.push(`[Portfolio](${formData.portfolio})`);
  }
  if (formData.blog) {
    socialLinks.push(`[Blog](${formData.blog})`);
  }
  if (socialLinks.length > 0) {
    markdown += "## Connect With Me\n";
    markdown += socialLinks.join(" | ") + "\n\n";
  }
  if (formData.showGithubStats && formData.github) {
    markdown += "## GitHub Stats\n";
    markdown += `![${formData.github}'s GitHub Stats](https://github-readme-stats.vercel.app/api?username=${formData.github}&show_icons=true&theme=radical)

`;
  }
  if (formData.showStreakStats && formData.github) {
    markdown += "## GitHub Streak\n";
    markdown += `![GitHub Streak](https://github-readme-streak-stats.herokuapp.com/?user=${formData.github}&theme=radical)

`;
  }
  if (formData.showTopLanguages && formData.github) {
    markdown += "## Top Languages\n";
    markdown += `![Top Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=${formData.github}&layout=compact&theme=radical)

`;
  }
  if (formData.showVisitors) {
    markdown += "## Profile Views\n";
    markdown += `![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2F${formData.github}&label=Visitors&countColor=%23263759&style=flat)

`;
  }
  if (formData.buyMeCoffee) {
    markdown += `## Support
`;
    markdown += `[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](${formData.buyMeCoffee})

`;
  }
  if (formData.customSection) {
    markdown += `## ${formData.customSectionTitle || "More"}
`;
    markdown += formData.customSection + "\n\n";
  }
  markdown += "---\n";
  markdown += `*Generated with ❤️ by JobTube Eco System*`;
  return markdown;
}
const SKILLS_BY_CATEGORY = {
  "Languages": [
    "JavaScript",
    "TypeScript",
    "Python",
    "Go",
    "Rust",
    "Java",
    "C++",
    "C#",
    "PHP",
    "Ruby",
    "Swift",
    "Kotlin"
  ],
  "Frontend": [
    "React",
    "Vue.js",
    "Angular",
    "Svelte",
    "Next.js",
    "Nuxt.js",
    "HTML5",
    "CSS3",
    "Tailwind CSS",
    "Material UI"
  ],
  "Backend": [
    "Node.js",
    "Express",
    "Django",
    "Flask",
    "Spring Boot",
    "FastAPI",
    "NestJS",
    "Gin",
    "Laravel",
    "ASP.NET"
  ],
  "Databases": [
    "MongoDB",
    "PostgreSQL",
    "MySQL",
    "Redis",
    "DynamoDB",
    "Firebase",
    "SQLite",
    "Elasticsearch"
  ],
  "DevOps & Tools": [
    "Docker",
    "Kubernetes",
    "AWS",
    "Google Cloud",
    "Azure",
    "Git",
    "CI/CD",
    "Linux",
    "Nginx",
    "Apache"
  ]
};
function GitHubReadmePreview({ markdown, onCopy, onDownload, copied }) {
  const renderMarkdown = (md) => {
    if (!md) return "<p>Preview will appear here...</p>";
    let html = md.replace(/^### (.*?)$/gm, '<h3 class="text-xl font-bold mt-4 mb-2">$1</h3>').replace(/^## (.*?)$/gm, '<h2 class="text-2xl font-bold mt-6 mb-3">$1</h2>').replace(/^# (.*?)$/gm, '<h1 class="text-4xl font-black mb-3">$1</h1>').replace(/^\*\*\*$/gm, '<hr class="my-6 border-slate-300">').replace(/^---$/gm, '<hr class="my-6 border-slate-300">').replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>').replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>').replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">$1</code>').replace(/^\- (.*?)$/gm, '<li class="ml-4">$1</li>').replace(/(<li.*?<\/li>)/s, '<ul class="list-disc my-3">$1</ul>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline" target="_blank">$1</a>').replace(/^(```[\s\S]*?```)/gm, (match) => {
      const code = match.replace(/```/g, "");
      return `<pre class="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto my-3"><code>${code}</code></pre>`;
    }).replace(/\n\n/g, '</p><p class="my-3">').replace(/^(?!<[hpli]|<ul|<pre|<hr)(.+)$/gm, '<p class="my-2">$1</p>');
    html = '<p class="my-2">' + html + "</p>";
    return html;
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-700", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white", children: "Preview" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: onCopy,
            className: "flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors",
            title: "Copy to clipboard",
            children: copied ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4" }),
              "Copied!"
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Copy, { className: "w-4 h-4" }),
              "Copy"
            ] })
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: onDownload,
            className: "flex items-center gap-2 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-colors",
            title: "Download as README.md",
            children: [
              /* @__PURE__ */ jsx(Download, { className: "w-4 h-4" }),
              "Download"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto bg-white dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: /* @__PURE__ */ jsx(
      "div",
      {
        className: "prose dark:prose-invert prose-sm max-w-none text-slate-900 dark:text-slate-100",
        dangerouslySetInnerHTML: { __html: renderMarkdown(markdown) }
      }
    ) })
  ] });
}
function GitHubReadmeGenerator() {
  const [formData, setFormData] = useState({
    name: "",
    tagline: "",
    bio: "",
    github: "",
    currentWork: "",
    learning: "",
    askAbout: "",
    email: "",
    linkedin: "",
    twitter: "",
    instagram: "",
    portfolio: "",
    blog: "",
    skills: [],
    techStack: "",
    showGithubStats: true,
    showStreakStats: true,
    showTopLanguages: true,
    showVisitors: true,
    buyMeCoffee: "",
    customSection: "",
    customSectionTitle: "Additional Info"
  });
  const [markdown, setMarkdown] = useState("");
  const [copied, setCopied] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  useEffect(() => {
    setMarkdown(generateReadme(formData));
  }, [formData]);
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };
  const addSkill = (skill) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.includes(skill) ? prev.skills.filter((s) => s !== skill) : [...prev.skills, skill]
    }));
  };
  const removeSkill = (skill) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill)
    }));
  };
  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([markdown], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "README.md";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  return /* @__PURE__ */ jsx("div", { className: "w-full space-y-8", children: /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "space-y-6 overflow-y-auto max-h-[80vh] pr-4", children: [
      /* @__PURE__ */ jsxs("section", { className: "bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white mb-4", children: "Personal Info" }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "name",
              placeholder: "Your Name",
              value: formData.name,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "tagline",
              placeholder: "Your Tagline (e.g., Full Stack Developer | React Enthusiast)",
              value: formData.tagline,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          ),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              name: "bio",
              placeholder: "Short bio about yourself...",
              value: formData.bio,
              onChange: handleInputChange,
              rows: 3,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "email",
              name: "email",
              placeholder: "Your Email",
              value: formData.email,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white mb-4", children: "Current Work" }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "currentWork",
              placeholder: "What are you working on?",
              value: formData.currentWork,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "learning",
              placeholder: "What are you learning?",
              value: formData.learning,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "askAbout",
              placeholder: "What to ask you about? (e.g., Web Development, React)",
              value: formData.askAbout,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white mb-4", children: "Dev Profiles" }),
        /* @__PURE__ */ jsx("div", { className: "space-y-3", children: [
          { name: "github", label: "GitHub Username" },
          { name: "linkedin", label: "LinkedIn Profile URL" },
          { name: "portfolio", label: "Portfolio URL" },
          { name: "blog", label: "Blog URL" },
          { name: "twitter", label: "Twitter Handle" },
          { name: "instagram", label: "Instagram Handle" }
        ].map((field) => /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            name: field.name,
            placeholder: field.label,
            value: formData[field.name],
            onChange: handleInputChange,
            className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          },
          field.name
        )) })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white mb-4", children: "Skills" }),
        formData.skills.length > 0 && /* @__PURE__ */ jsx("div", { className: "mb-4 flex flex-wrap gap-2", children: formData.skills.map((skill) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm", children: [
          skill,
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => removeSkill(skill),
              className: "text-blue-700 dark:text-blue-300 hover:text-blue-900",
              children: /* @__PURE__ */ jsx(X, { className: "w-4 h-4" })
            }
          )
        ] }, skill)) }),
        /* @__PURE__ */ jsx("div", { className: "space-y-2", children: Object.entries(SKILLS_BY_CATEGORY).map(([category, skills]) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setExpandedCategory(expandedCategory === category ? null : category),
              className: "w-full text-left px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-semibold text-slate-900 dark:text-white transition-colors",
              children: category
            }
          ),
          expandedCategory === category && /* @__PURE__ */ jsx("div", { className: "mt-2 grid grid-cols-2 gap-2", children: skills.map((skill) => /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => addSkill(skill),
              className: `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${formData.skills.includes(skill) ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600"}`,
              children: skill
            },
            skill
          )) })
        ] }, category)) })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white mb-4", children: "GitHub Stats" }),
        /* @__PURE__ */ jsx("div", { className: "space-y-3", children: [
          { name: "showGithubStats", label: "Show GitHub Stats Card" },
          { name: "showStreakStats", label: "Show GitHub Streak Stats" },
          { name: "showTopLanguages", label: "Show Top Languages" },
          { name: "showVisitors", label: "Show Visitors Counter" }
        ].map((field) => /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-3 cursor-pointer", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              name: field.name,
              checked: formData[field.name],
              onChange: handleInputChange,
              className: "w-4 h-4 rounded border-slate-300 text-blue-600"
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-slate-900 dark:text-white", children: field.label })
        ] }, field.name)) })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white mb-4", children: "Extras" }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "buyMeCoffee",
              placeholder: "Buy Me A Coffee Link (optional)",
              value: formData.buyMeCoffee,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "techStack",
              placeholder: "Tech Stack (comma-separated, e.g., React, Node.js, MongoDB)",
              value: formData.techStack,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-white mb-4", children: "Custom Section" }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "customSectionTitle",
              placeholder: "Section Title",
              value: formData.customSectionTitle,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          ),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              name: "customSection",
              placeholder: "Custom markdown content...",
              value: formData.customSection,
              onChange: handleInputChange,
              rows: 4,
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "h-[80vh]", children: /* @__PURE__ */ jsx(
      GitHubReadmePreview,
      {
        markdown,
        onCopy: handleCopy,
        onDownload: handleDownload,
        copied
      }
    ) })
  ] }) });
}
function getScoreColor$2(score) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#0ea5e9";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}
function GitHubOptimizer() {
  const [activeTab, setActiveTab] = useState("analyzer");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [copied, setCopied] = useState(false);
  const validateUsername = (value) => {
    if (!value.trim()) {
      return "GitHub username is required";
    }
    if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value)) {
      return "Invalid GitHub username format";
    }
    return "";
  };
  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    setValidationError(validateUsername(value));
  };
  const handleAnalyze = async (e) => {
    var _a, _b;
    e.preventDefault();
    const validation = validateUsername(username);
    if (validation) {
      setValidationError(validation);
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const { data } = await api.post("/profiles/github/analyze", { username });
      setReport(data);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const handleCopy = () => {
    if (!(report == null ? void 0 : report.generatedReadme)) return;
    navigator.clipboard.writeText(report.generatedReadme);
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-6xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-900 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "code" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "GitHub Profile Optimizer" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Analyze your GitHub profile or create a custom README from scratch." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-4 mb-12 justify-center border-b border-slate-200 dark:border-slate-700", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setActiveTab("analyzer"),
          className: `px-6 py-3 font-semibold transition-all border-b-2 ${activeTab === "analyzer" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:text-slate-900"}`,
          children: "📊 Analyzer"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setActiveTab("generator"),
          className: `px-6 py-3 font-semibold transition-all border-b-2 ${activeTab === "generator" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:text-slate-900"}`,
          children: "✏️ Generator"
        }
      )
    ] }),
    activeTab === "analyzer" && /* @__PURE__ */ jsxs(Fragment, { children: [
      error && /* @__PURE__ */ jsx("div", { className: "max-w-2xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium", children: error }),
      validationError && /* @__PURE__ */ jsx("div", { className: "max-w-2xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium", children: validationError }),
      /* @__PURE__ */ jsx("form", { onSubmit: handleAnalyze, className: "max-w-2xl mx-auto mb-16", children: /* @__PURE__ */ jsx("div", { className: "relative glass-card rounded-3xl p-2 shadow-lg", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 p-4", children: [
        /* @__PURE__ */ jsx("div", { className: "w-12 h-12 rounded-2xl glass-card flex items-center justify-center", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-900 text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "person" }) }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            placeholder: "Enter your GitHub username",
            className: `flex-1 bg-transparent outline-none font-medium text-on-surface placeholder:text-outline text-lg ${validationError ? "border-b-2 border-red-500" : ""}`,
            value: username,
            onChange: handleUsernameChange
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: loading || !!validationError,
            className: "bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 text-white px-8 py-3 rounded-2xl font-bold hover:from-slate-700 hover:to-slate-800 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_30px_rgba(15,23,42,0.3)] flex items-center gap-3",
            children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
              "Analyzing..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "search" }),
              "Analyze Profile"
            ] })
          }
        )
      ] }) }) }),
      loading && /* @__PURE__ */ jsx("div", { className: "max-w-2xl mx-auto text-center py-12", children: /* @__PURE__ */ jsxs("div", { className: "inline-flex flex-col items-center gap-4", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-slate-700 text-5xl", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
        /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium", children: "Fetching real GitHub data and generating custom README..." })
      ] }) }),
      report && !loading && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "lg:col-span-1 space-y-8", children: [
          /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl text-center", children: [
            /* @__PURE__ */ jsxs("div", { className: "relative mb-6", children: [
              /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 36 36", className: "w-24 h-24 -rotate-90 mx-auto", children: [
                /* @__PURE__ */ jsx("circle", { cx: "18", cy: "18", r: "15.9", fill: "none", stroke: "#e5eeff", strokeWidth: "3.2" }),
                /* @__PURE__ */ jsx(
                  "circle",
                  {
                    cx: "18",
                    cy: "18",
                    r: "15.9",
                    fill: "none",
                    stroke: getScoreColor$2(report.score),
                    strokeWidth: "3.2",
                    strokeDasharray: `${report.score / 100 * 100} 100`,
                    strokeLinecap: "round"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
                /* @__PURE__ */ jsx("span", { className: "text-3xl font-black text-on-surface", children: report.score }),
                /* @__PURE__ */ jsx("span", { className: "text-xs text-on-surface-variant font-bold", children: "/ 100" })
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              "div",
              {
                className: "inline-block px-3 py-1 rounded-full text-xs font-bold mb-3",
                style: { backgroundColor: `${getScoreColor$2(report.score)}20`, color: getScoreColor$2(report.score) },
                children: report.scoreLabel || "Profile Score"
              }
            ),
            /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface mb-2 font-headline", children: "Profile Health" }),
            report.scoreDescription && /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant text-sm font-medium", children: report.scoreDescription }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4 mt-6", children: [
              /* @__PURE__ */ jsxs("div", { className: "glass-card bg-surface-container/30 p-4 rounded-2xl text-center", children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-outline text-xl mb-2 block", style: { fontVariationSettings: "'FILL' 0" }, children: "account_tree" }),
                /* @__PURE__ */ jsx("div", { className: "font-black text-2xl text-on-surface", children: report.repoCount }),
                /* @__PURE__ */ jsx("div", { className: "text-xs font-bold text-outline uppercase tracking-wider", children: "Repos" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "glass-card bg-surface-container/30 p-4 rounded-2xl text-center", children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-amber-500 text-xl mb-2 block", style: { fontVariationSettings: "'FILL' 1" }, children: "star" }),
                /* @__PURE__ */ jsx("div", { className: "font-black text-2xl text-on-surface", children: report.stars }),
                /* @__PURE__ */ jsx("div", { className: "text-xs font-bold text-outline uppercase tracking-wider", children: "Stars" })
              ] })
            ] }),
            report.languages && report.languages.length > 0 && /* @__PURE__ */ jsx("div", { className: "mt-4 flex flex-wrap gap-2 justify-center", children: report.languages.slice(0, 6).map((lang, i) => /* @__PURE__ */ jsx("span", { className: "px-2 py-1 glass-card bg-surface-container/30 rounded-lg text-xs font-bold text-on-surface-variant", children: lang }, i)) })
          ] }),
          report.strengths && report.strengths.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
            /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-emerald-600 mb-6 flex items-center gap-3 font-headline", children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-500 text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "check_circle" }),
              "Strengths"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "space-y-4", children: report.strengths.map((s, i) => /* @__PURE__ */ jsxs("li", { className: "text-on-surface-variant font-medium flex gap-3 items-start", children: [
              /* @__PURE__ */ jsx("span", { className: "w-2 h-2 mt-2 rounded-full bg-emerald-500 flex-shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "text-sm leading-relaxed", children: s })
            ] }, i)) })
          ] }),
          report.issues && report.issues.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
            /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-rose-600 mb-6 flex items-center gap-3 font-headline", children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-rose-500 text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "warning" }),
              "Improvements"
            ] }),
            /* @__PURE__ */ jsx("ul", { className: "space-y-4", children: report.issues.map((iss, i) => /* @__PURE__ */ jsxs("li", { className: "text-on-surface-variant font-medium flex gap-3 items-start", children: [
              /* @__PURE__ */ jsx("span", { className: "w-2 h-2 mt-2 rounded-full bg-rose-500 flex-shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "text-sm leading-relaxed", children: iss })
            ] }, i)) })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs("div", { className: "glass-card border-slate-700/50 rounded-3xl shadow-[0px_25px_50px_rgba(15,23,42,0.25)] overflow-hidden flex flex-col", style: { minHeight: "500px" }, children: [
          /* @__PURE__ */ jsxs("div", { className: "glass-panel border-b border-white/20 bg-slate-800/50 px-8 py-6 flex justify-between items-center", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-400 text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "description" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h3", { className: "text-white font-bold text-lg", children: "Generated Profile README.md" }),
                /* @__PURE__ */ jsx("p", { className: "text-slate-400 text-sm", children: "AI-generated from your real GitHub data" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: handleCopy,
                className: "glass-card hover:bg-white/10 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 border border-slate-600/50",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: copied ? "check" : "content_copy" }),
                  copied ? "Copied!" : "Copy"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx("div", { className: "p-8 overflow-y-auto flex-grow", children: /* @__PURE__ */ jsx("pre", { className: "text-slate-300 font-mono text-sm whitespace-pre-wrap leading-relaxed", children: report.generatedReadme || "No README generated." }) })
        ] }) })
      ] })
    ] }),
    activeTab === "generator" && /* @__PURE__ */ jsx(GitHubReadmeGenerator, {})
  ] });
}
function PortfolioBuilder() {
  const [sections, setSections] = useState([
    { id: 1, type: "hero", title: "Hi, I am Alex Developer", subtitle: "Building aesthetic, modern web experiences.", bg: "bg-slate-900 text-white" },
    { id: 2, type: "about", text: "I am a passionate software engineer specializing in frontend technologies ecosystem. I love building tools that empower users." }
  ]);
  return /* @__PURE__ */ jsxs("div", { className: "flex h-[calc(100vh-80px)] overflow-hidden w-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "w-80 glass-card rounded-r-3xl rounded-l-none border-l-0 flex flex-col hidden sm:flex shadow-none", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-indigo-600 text-2xl", style: { fontVariationSettings: "'FILL' 0" }, children: "web" }),
          /* @__PURE__ */ jsx("h2", { className: "text-xl font-black text-on-surface font-headline", children: "Portfolio Blocks" })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-on-surface-variant font-medium", children: "Drag blocks to build your professional site" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "px-8 pb-8 space-y-4 overflow-y-auto flex-grow", children: [
        /* @__PURE__ */ jsxs("button", { className: "w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform", style: { fontVariationSettings: "'FILL' 0" }, children: "text_fields" }),
          /* @__PURE__ */ jsx("span", { className: "font-bold text-on-surface", children: "Hero Section" })
        ] }),
        /* @__PURE__ */ jsxs("button", { className: "w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform", style: { fontVariationSettings: "'FILL' 0" }, children: "image" }),
          /* @__PURE__ */ jsx("span", { className: "font-bold text-on-surface", children: "Project Gallery" })
        ] }),
        /* @__PURE__ */ jsxs("button", { className: "w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform", style: { fontVariationSettings: "'FILL' 0" }, children: "edit" }),
          /* @__PURE__ */ jsx("span", { className: "font-bold text-on-surface", children: "About Section" })
        ] }),
        /* @__PURE__ */ jsxs("button", { className: "w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform", style: { fontVariationSettings: "'FILL' 0" }, children: "contact_page" }),
          /* @__PURE__ */ jsx("span", { className: "font-bold text-on-surface", children: "Contact & Social" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-8 space-y-4", children: [
        /* @__PURE__ */ jsxs("button", { className: "w-full bg-indigo-600 text-on-primary font-bold py-4 rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all duration-200 shadow-[0px_10px_30px_rgba(99,102,241,0.3)] flex items-center justify-center gap-3", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "visibility" }),
          "Preview Site"
        ] }),
        /* @__PURE__ */ jsxs("button", { className: "w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-2xl hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0px_15px_35px_rgba(0,78,159,0.25)] flex items-center justify-center gap-3", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "publish" }),
          "Publish Portfolio"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-grow overflow-y-auto p-4 sm:p-8", children: /* @__PURE__ */ jsx("div", { className: "max-w-5xl mx-auto glass-card min-h-[900px] rounded-3xl overflow-hidden", children: sections.map((sec) => /* @__PURE__ */ jsxs("div", { className: `group relative hover:shadow-[0px_10px_30px_rgba(0,78,159,0.15)] transition-all duration-300 ${sec.bg || "glass-card border-none"}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity glass-card text-on-surface text-sm px-4 py-2 rounded-2xl shadow-lg font-bold cursor-pointer border flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: "edit" }),
        "Edit Block"
      ] }),
      sec.type === "hero" && /* @__PURE__ */ jsxs("div", { className: "py-32 px-16 text-center", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-6xl font-black tracking-tight mb-8 font-headline", children: sec.title }),
        /* @__PURE__ */ jsx("p", { className: "text-xl text-on-surface-variant font-medium max-w-2xl mx-auto leading-relaxed", children: sec.subtitle })
      ] }),
      sec.type === "about" && /* @__PURE__ */ jsxs("div", { className: "py-20 px-16", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-3xl font-black mb-8 font-headline", children: "About Me" }),
        /* @__PURE__ */ jsx("p", { className: "text-lg leading-relaxed text-on-surface-variant font-medium max-w-3xl", children: sec.text })
      ] })
    ] }, sec.id)) }) })
  ] });
}
const FALLBACK_PROJECTS = [
  { id: 1, title: "E-Commerce Dashboard", diff: "Intermediate", time: "10 hrs", tech: ["React", "Chart.js", "Tailwind"], category: "Frontend", color: "#3b82f6" },
  { id: 2, title: "Real-time Chat App", diff: "Advanced", time: "15 hrs", tech: ["Node.js", "Socket.io", "Express"], category: "Full Stack", color: "#8b5cf6" },
  { id: 3, title: "Weather API Wrapper", diff: "Beginner", time: "3 hrs", tech: ["JavaScript", "Fetch API"], category: "Backend", color: "#10b981" },
  { id: 4, title: "URL Shortener", diff: "Intermediate", time: "8 hrs", tech: ["Express", "MongoDB", "Redis"], category: "Backend", color: "#10b981" }
];
const CATEGORY_COLORS = { Frontend: "#3b82f6", Backend: "#10b981", "Full Stack": "#8b5cf6", Database: "#f59e0b" };
function ProjectIdeas() {
  const [filter, setFilter] = useState("All");
  const [projects, setProjects] = useState(FALLBACK_PROJECTS);
  useEffect(() => {
    api.get("/projects/ideas").then(({ data }) => {
      if (Array.isArray(data) && data.length > 0) {
        setProjects(data.map((p) => ({ ...p, color: CATEGORY_COLORS[p.category] || "#6366f1" })));
      }
    }).catch(() => {
    });
  }, []);
  const filtered = filter === "All" ? projects : projects.filter((p) => p.category === filter);
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-7xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-rose-500/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-rose-600 text-3xl", style: { fontVariationSettings: "'FILL' 1" }, children: "lightbulb" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Project Ideas & Templates" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Build your portfolio with 200+ guided projects. Step-by-step instructions and starter templates included." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex gap-4 justify-center mb-16 overflow-x-auto", children: ["All", "Frontend", "Backend", "Full Stack"].map((c) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => setFilter(c),
        className: `px-8 py-3 rounded-2xl font-bold whitespace-nowrap transition-all duration-200 ${filter === c ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30" : "glass-card hover:bg-white/40 text-on-surface-variant hover:text-on-surface"}`,
        children: c
      },
      c
    )) }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8", children: filtered.map((proj) => /* @__PURE__ */ jsxs("div", { className: "group glass-card rounded-3xl p-8 hover:-translate-y-2 transition-all duration-300 flex flex-col", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-6", children: [
        /* @__PURE__ */ jsx("span", { className: `px-4 py-2 rounded-2xl text-xs font-bold uppercase tracking-wider ${proj.diff === "Beginner" ? "bg-emerald-500/10 text-emerald-700" : proj.diff === "Intermediate" ? "bg-amber-500/10 text-amber-700" : "bg-rose-500/10 text-rose-700"}`, children: proj.diff }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-outline text-sm font-bold", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 0" }, children: "schedule" }),
          proj.time
        ] })
      ] }),
      /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface mb-4 font-headline leading-tight", children: proj.title }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 mb-8 flex-grow", children: proj.tech.map((t) => /* @__PURE__ */ jsx("span", { className: "px-3 py-1.5 bg-surface-container/50 border border-outline/20 text-on-surface-variant rounded-xl font-semibold text-sm", children: t }, t)) }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3 mt-auto", children: [
        /* @__PURE__ */ jsxs("button", { className: "flex-1 py-4 bg-gradient-to-r from-rose-500 to-rose-600 text-on-primary font-bold rounded-2xl hover:from-rose-600 hover:to-rose-700 active:scale-95 transition-all duration-200 shadow-[0px_8px_20px_rgba(244,63,94,0.3)] flex items-center justify-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sm", style: { fontVariationSettings: "'FILL' 0" }, children: "play_arrow" }),
          "Start Guide"
        ] }),
        /* @__PURE__ */ jsx("button", { className: "px-5 py-4 glass-card hover:bg-white/40 text-on-surface font-bold rounded-2xl active:scale-95 transition-all duration-200", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "code" }) })
      ] })
    ] }, proj.id)) })
  ] });
}
const ROLES = ["Frontend Developer", "Backend Developer", "Full Stack Developer", "Data Analyst", "DevOps Engineer"];
const TypeBadge = ({ type }) => {
  const config = {
    technical: { bg: "bg-blue-500/10 text-blue-700", icon: "code" },
    behavioral: { bg: "bg-purple-500/10 text-purple-700", icon: "psychology" },
    situational: { bg: "bg-amber-500/10 text-amber-700", icon: "lightbulb" },
    feedback: { bg: "bg-emerald-500/10 text-emerald-700", icon: "thumb_up" }
  };
  const c = config[type] || config.technical;
  return /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center gap-1 px-2.5 py-1 ${c.bg} text-xs font-bold rounded-lg uppercase`, children: [
    /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xs", style: { fontVariationSettings: "'FILL' 0" }, children: c.icon }),
    type
  ] });
};
function MockInterview() {
  const [stage, setStage] = useState("setup");
  const [selectedRole, setSelectedRole] = useState("Full Stack Developer");
  const [interviewId, setInterviewId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionType, setQuestionType] = useState("");
  const [tips, setTips] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  const chatEndRef = useRef(null);
  useEffect(() => {
    var _a;
    (_a = chatEndRef.current) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  const startInterview = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/interview/start", { role: selectedRole });
      const res = data.data;
      setInterviewId(res.interviewId);
      setCurrentQuestion(res.question);
      setQuestionType(res.question_type);
      setTips(res.tips || []);
      setMessages([{ role: "interviewer", content: res.question, type: res.question_type }]);
      setStage("interview");
    } catch (err) {
      console.error(err);
      alert("Failed to start interview. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const sendAnswer = async () => {
    if (!currentAnswer.trim() || loading) return;
    setLoading(true);
    const userMsg = { role: "candidate", content: currentAnswer.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setCurrentAnswer("");
    try {
      const { data } = await api.post(`/interview/${interviewId}/respond`, { answer: userMsg.content });
      const res = data.data;
      const newMessages = [];
      if (res.feedback) {
        newMessages.push({ role: "interviewer", content: res.feedback, type: "feedback" });
      }
      if (res.question) {
        newMessages.push({ role: "interviewer", content: res.question, type: res.question_type });
      }
      setMessages((prev) => [...prev, ...newMessages]);
      setCurrentQuestion(res.question);
      setQuestionType(res.question_type);
      setTips(res.tips || []);
      if (res.is_complete) {
        setFinalResult(res);
        setStage("complete");
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { role: "interviewer", content: "Sorry, there was an error processing your response. Please try again.", type: "feedback" }]);
    } finally {
      setLoading(false);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAnswer();
    }
  };
  if (stage === "setup") {
    return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl mx-auto py-16 px-4 sm:px-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
        /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-violet-500/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-violet-600 text-3xl", style: { fontVariationSettings: "'FILL' 1" }, children: "record_voice_over" }) }),
        /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "AI Mock Interview" }),
        /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Practice with an AI interviewer that adapts to your responses. Get real-time feedback and a readiness score." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl mb-8", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface mb-6", children: "Select Target Role" }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: ROLES.map((role) => /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setSelectedRole(role),
            className: `p-4 rounded-2xl font-bold text-left transition-all duration-200 ${selectedRole === role ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30" : "bg-white/40 border border-white/60 text-on-surface-variant hover:bg-white/60 hover:text-on-surface"}`,
            children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: selectedRole === role ? "radio_button_checked" : "radio_button_unchecked" }),
              role
            ] })
          },
          role
        )) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card border-violet-500/20 p-6 rounded-3xl mb-8", children: [
        /* @__PURE__ */ jsxs("h4", { className: "font-bold text-on-surface mb-3 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-violet-600 text-base", style: { fontVariationSettings: "'FILL' 1" }, children: "info" }),
          "How it works"
        ] }),
        /* @__PURE__ */ jsxs("ul", { className: "space-y-2 text-on-surface-variant text-sm font-medium", children: [
          /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-violet-600 font-bold", children: "1." }),
            " AI asks 5 tailored questions (technical + behavioral)"
          ] }),
          /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-violet-600 font-bold", children: "2." }),
            " You get instant feedback after each answer"
          ] }),
          /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-violet-600 font-bold", children: "3." }),
            " Receive a final readiness score with improvement areas"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: startInterview,
          disabled: loading,
          className: "w-full py-5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-lg rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0px_20px_40px_rgba(139,92,246,0.3)] flex items-center justify-center gap-3 disabled:opacity-60",
          children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
            "Preparing Interview..."
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "mic" }),
            "Start Mock Interview"
          ] })
        }
      )
    ] });
  }
  if (stage === "complete" && finalResult) {
    return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl mx-auto py-12 px-4 sm:px-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center mb-12", children: [
        /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full mb-6", children: /* @__PURE__ */ jsx("span", { className: "text-4xl font-black text-white", children: finalResult.final_score || 70 }) }),
        /* @__PURE__ */ jsx("h2", { className: "text-3xl font-black text-on-surface font-headline mb-2", children: "Interview Complete!" }),
        /* @__PURE__ */ jsxs("p", { className: "text-on-surface-variant font-medium", children: [
          "Your readiness score for ",
          selectedRole
        ] })
      ] }),
      finalResult.final_feedback && /* @__PURE__ */ jsx("div", { className: "glass-card border-violet-500/20 p-6 rounded-3xl mb-8", children: /* @__PURE__ */ jsx("p", { className: "text-on-surface font-medium leading-relaxed", children: finalResult.final_feedback }) }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8 mb-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-500 text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "thumb_up" }),
            "Strengths"
          ] }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: (finalResult.strengths || ["Clear communication"]).map((s, i) => /* @__PURE__ */ jsx("li", { className: "text-on-surface-variant bg-surface-container px-4 py-3 rounded-xl font-medium", children: s }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-amber-500 text-xl", style: { fontVariationSettings: "'FILL' 0" }, children: "trending_up" }),
            "Areas to Improve"
          ] }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: (finalResult.improvements || ["Add more technical depth"]).map((s, i) => /* @__PURE__ */ jsx("li", { className: "text-on-surface-variant bg-surface-container px-4 py-3 rounded-xl font-medium", children: s }, i)) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex gap-4 justify-center", children: /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => {
            setStage("setup");
            setMessages([]);
            setFinalResult(null);
          },
          className: "px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-3",
          children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "replay" }),
            "Try Another Role"
          ]
        }
      ) })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl mx-auto py-8 px-4 sm:px-6 flex flex-col", style: { height: "calc(100vh - 100px)" }, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-6", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h2", { className: "text-2xl font-black text-on-surface font-headline flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-violet-600 text-2xl", style: { fontVariationSettings: "'FILL' 1" }, children: "record_voice_over" }),
          "Mock Interview"
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-outline font-medium mt-1", children: [
          "Role: ",
          selectedRole
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm text-outline font-bold", children: [
        /* @__PURE__ */ jsx("span", { className: "w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" }),
        "Live Session"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto space-y-4 mb-6 pr-2", children: [
      messages.map((msg, i) => /* @__PURE__ */ jsx("div", { className: `flex ${msg.role === "candidate" ? "justify-end" : "justify-start"} animate-[fadeIn_0.3s_ease-out]`, children: /* @__PURE__ */ jsxs("div", { className: `max-w-[80%] p-5 rounded-3xl ${msg.role === "candidate" ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-br-lg" : msg.type === "feedback" ? "bg-emerald-500/10 text-on-surface border border-emerald-200 rounded-bl-lg" : "glass-card text-on-surface rounded-bl-lg"}`, children: [
        msg.role === "interviewer" && msg.type && msg.type !== "feedback" && /* @__PURE__ */ jsx("div", { className: "mb-3", children: /* @__PURE__ */ jsx(TypeBadge, { type: msg.type }) }),
        msg.type === "feedback" && /* @__PURE__ */ jsxs("div", { className: "mb-2 text-xs font-bold text-emerald-700 uppercase flex items-center gap-1", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xs", style: { fontVariationSettings: "'FILL' 1" }, children: "lightbulb" }),
          " Feedback"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "font-medium leading-relaxed whitespace-pre-wrap", children: msg.content })
      ] }) }, i)),
      loading && /* @__PURE__ */ jsx("div", { className: "flex justify-start", children: /* @__PURE__ */ jsx("div", { className: "glass-card p-5 rounded-3xl rounded-bl-lg", children: /* @__PURE__ */ jsxs("div", { className: "flex gap-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "w-2.5 h-2.5 bg-outline/40 rounded-full animate-bounce", style: { animationDelay: "0ms" } }),
        /* @__PURE__ */ jsx("span", { className: "w-2.5 h-2.5 bg-outline/40 rounded-full animate-bounce", style: { animationDelay: "150ms" } }),
        /* @__PURE__ */ jsx("span", { className: "w-2.5 h-2.5 bg-outline/40 rounded-full animate-bounce", style: { animationDelay: "300ms" } })
      ] }) }) }),
      /* @__PURE__ */ jsx("div", { ref: chatEndRef })
    ] }),
    tips.length > 0 && /* @__PURE__ */ jsx("div", { className: "mb-4 px-4 py-3 bg-amber-500/5 rounded-2xl", children: /* @__PURE__ */ jsxs("p", { className: "text-xs font-bold text-amber-700 flex items-center gap-1.5", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xs", style: { fontVariationSettings: "'FILL' 1" }, children: "tips_and_updates" }),
      "Tip: ",
      tips[0]
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "flex-1 glass-card rounded-2xl p-4 focus:ring-2 focus:ring-violet-500/20 outline-none resize-none font-medium text-on-surface placeholder:text-outline/50",
          placeholder: "Type your answer... (Enter to send, Shift+Enter for newline)",
          rows: 3,
          value: currentAnswer,
          onChange: (e) => setCurrentAnswer(e.target.value),
          onKeyDown: handleKeyDown,
          disabled: loading
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: sendAnswer,
          disabled: loading || !currentAnswer.trim(),
          className: "px-6 bg-gradient-to-b from-violet-600 to-purple-600 text-white rounded-2xl hover:from-violet-700 hover:to-purple-700 active:scale-95 transition-all disabled:opacity-40 disabled:hover:from-violet-600 shadow-lg",
          children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-xl", style: { fontVariationSettings: "'FILL' 1" }, children: "send" })
        }
      )
    ] })
  ] });
}
function getScoreColor$1(score) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#0ea5e9";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}
function JobMatcher() {
  const [formData, setFormData] = useState({
    jobDescription: "",
    userSkills: ""
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const handleAnalyze = async (e) => {
    var _a, _b;
    e.preventDefault();
    if (!formData.jobDescription || !formData.userSkills) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const { data } = await api.post("/profiles/jobmatch", formData);
      setReport(data);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-indigo-500/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-indigo-600 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "work" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Job Description Matcher" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Paste a job description and your skills to instantly see how well you match and identify your skill gaps." })
    ] }),
    error && /* @__PURE__ */ jsx("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium", children: error }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleAnalyze, className: "grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl", children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Job Description" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            required: true,
            rows: 10,
            placeholder: "Paste the target job description here...",
            className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y",
            value: formData.jobDescription,
            onChange: (e) => setFormData({ ...formData, jobDescription: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl flex flex-col", children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Your Skills" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            required: true,
            rows: 6,
            placeholder: "E.g., React, Node.js, TypeScript, SQL...",
            className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y flex-1 mb-4",
            value: formData.userSkills,
            onChange: (e) => setFormData({ ...formData, userSkills: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: loading,
            className: "w-full bg-gradient-to-r from-indigo-500 to-indigo-600 text-on-primary px-8 py-3 rounded-xl font-bold hover:from-indigo-600 hover:to-indigo-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_20px_rgba(99,102,241,0.3)] flex items-center justify-center gap-3",
            children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
              "Matching..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "join_inner" }),
              "Calculate Match Score"
            ] })
          }
        )
      ] })
    ] }),
    report && !loading && /* @__PURE__ */ jsxs("div", { className: "max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl text-center flex flex-col items-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative mb-6", children: [
          /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 36 36", className: "w-32 h-32 -rotate-90 mx-auto", children: [
            /* @__PURE__ */ jsx("circle", { cx: "18", cy: "18", r: "15.9", fill: "none", stroke: "#e5eeff", strokeWidth: "3.2" }),
            /* @__PURE__ */ jsx(
              "circle",
              {
                cx: "18",
                cy: "18",
                r: "15.9",
                fill: "none",
                stroke: getScoreColor$1(report.matchScore),
                strokeWidth: "3.2",
                strokeDasharray: `${report.matchScore / 100 * 100} 100`,
                strokeLinecap: "round"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
            /* @__PURE__ */ jsx("span", { className: "text-4xl font-black text-on-surface", children: report.matchScore }),
            /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-on-surface-variant uppercase tracking-wider", children: "/ 100" })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "inline-block px-4 py-1 rounded-full text-sm font-bold mb-3",
            style: { backgroundColor: `${getScoreColor$1(report.matchScore)}20`, color: getScoreColor$1(report.matchScore) },
            children: report.matchLabel
          }
        ),
        /* @__PURE__ */ jsxs("p", { className: "text-on-surface-variant font-medium", children: [
          "You matched ",
          report.totalMatched,
          " out of ",
          report.totalJdKeywords,
          " key skills found in this job description."
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl border-emerald-500/20", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-lg font-bold text-emerald-600 flex items-center gap-2 mb-4", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined", style: { fontVariationSettings: "'FILL' 1" }, children: "check_circle" }),
            "Matched Skills"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: report.matchedKeywords.length > 0 ? report.matchedKeywords.map((kw, i) => /* @__PURE__ */ jsx("span", { className: "px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-sm rounded-lg border border-emerald-200", children: kw }, i)) : /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-on-surface-variant", children: "No matching skills found." }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl border-rose-500/20", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-lg font-bold text-rose-600 flex items-center gap-2 mb-4", children: [
            /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined", style: { fontVariationSettings: "'FILL' 1" }, children: "cancel" }),
            "Missing Skills (Gaps)"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: report.missingKeywords.length > 0 ? report.missingKeywords.map((kw, i) => /* @__PURE__ */ jsx("span", { className: "px-3 py-1 bg-rose-50 text-rose-700 font-bold text-sm rounded-lg border border-rose-200", children: kw }, i)) : /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-on-surface-variant", children: "No gaps identified!" }) })
        ] })
      ] }),
      Object.keys(report.gapsByCategory).length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card p-8 rounded-3xl", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface mb-6 font-headline", children: "Gaps by Category" }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-6", children: Object.entries(report.gapsByCategory).map(([category, kws]) => /* @__PURE__ */ jsxs("div", { className: "bg-surface-container p-4 rounded-2xl", children: [
          /* @__PURE__ */ jsx("h4", { className: "font-bold text-on-surface capitalize mb-3", children: category }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: kws.map((kw, i) => /* @__PURE__ */ jsx("span", { className: "px-2 py-1 bg-surface-container-highest text-on-surface-variant font-medium text-xs rounded-md", children: kw }, i)) })
        ] }, category)) })
      ] }),
      report.suggestions && report.suggestions.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card bg-indigo-50/50 border-indigo-200/50 p-8 rounded-3xl", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-indigo-700 mb-6 flex items-center gap-3 font-headline", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined", style: { fontVariationSettings: "'FILL' 1" }, children: "tips_and_updates" }),
          "How to Improve"
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: report.suggestions.map((s, i) => /* @__PURE__ */ jsxs("li", { className: "flex gap-3 text-indigo-900 font-medium", children: [
          /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-indigo-500 shrink-0", children: "arrow_right" }),
          s
        ] }, i)) })
      ] })
    ] })
  ] });
}
const STATUSES = [
  { id: "applied", label: "Applied", color: "bg-blue-50", icon: Clock, textColor: "text-blue-700" },
  { id: "interview", label: "Interview", color: "bg-amber-50", icon: CheckCircle2, textColor: "text-amber-700" },
  { id: "offer", label: "Offer", color: "bg-green-50", icon: CheckCircle2, textColor: "text-green-700" },
  { id: "rejected", label: "Rejected", color: "bg-red-50", icon: XCircle, textColor: "text-red-700" }
];
function JobCard$1({ job, status, onDelete, onUpdate, onDragStart }) {
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState(job.notes || "");
  const handleSaveNotes = async () => {
    try {
      await api.patch(`/jobs/${job.id}`, { notes });
      onUpdate(job.id, { ...job, notes });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save notes:", err);
    }
  };
  const daysAgo = Math.floor((Date.now() - new Date(job.appliedAt)) / (1e3 * 60 * 60 * 24));
  return /* @__PURE__ */ jsxs(
    "div",
    {
      draggable: true,
      onDragStart: () => onDragStart(job),
      className: `glass-card p-4 rounded-2xl space-y-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-lg border border-white/50 relative overflow-hidden`,
      children: [
        /* @__PURE__ */ jsx("div", { className: `absolute top-0 left-0 w-1.5 h-full ${status.textColor.replace("text-", "bg-")}` }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: job.role }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600", children: job.company }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
              daysAgo,
              " days ago"
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => onDelete(job.id),
              className: "p-2 hover:bg-red-100 rounded-lg transition-colors",
              title: "Delete",
              children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4 text-red-600" })
            }
          )
        ] }),
        isEditing ? /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: notes,
              onChange: (e) => setNotes(e.target.value),
              className: "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none",
              placeholder: "Add notes...",
              rows: "3"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleSaveNotes,
              className: "px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors",
              children: "Save"
            }
          )
        ] }) : /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-700 flex-1", children: notes || "No notes" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsEditing(true),
              className: "p-1 hover:bg-blue-100 rounded transition-colors shrink-0",
              title: "Edit notes",
              children: /* @__PURE__ */ jsx(Edit2, { className: "w-3 h-3 text-blue-600" })
            }
          )
        ] })
      ]
    }
  );
}
function JobTracker() {
  const [jobs, setJobs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ company: "", role: "", status: "applied", notes: "" });
  const [stats, setStats] = useState({ total: 0, interviews: 0, offers: 0, replyRate: 0 });
  useEffect(() => {
    fetchJobs();
  }, []);
  const fetchJobs = async () => {
    try {
      const { data } = await api.get("/jobs");
      setJobs(data.jobs || []);
      setStats(data.stats || { total: 0, interviews: 0, offers: 0, replyRate: 0 });
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    }
  };
  const handleAddJob = async (e) => {
    e.preventDefault();
    if (!formData.company || !formData.role) return;
    try {
      const { data } = await api.post("/jobs", formData);
      setJobs([data, ...jobs]);
      setFormData({ company: "", role: "", status: "applied", notes: "" });
      setShowForm(false);
    } catch (err) {
      console.error("Failed to add job:", err);
    }
  };
  const handleDeleteJob = async (jobId) => {
    try {
      await api.delete(`/jobs/${jobId}`);
      setJobs(jobs.filter((j) => j.id !== jobId));
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  };
  const handleUpdateJob = async (jobId, newStatus) => {
    try {
      const { data } = await api.patch(`/jobs/${jobId}`, { status: newStatus });
      setJobs(jobs.map((j) => j.id === jobId ? data : j));
    } catch (err) {
      console.error("Failed to update job:", err);
    }
  };
  const [draggedJob, setDraggedJob] = useState(null);
  const handleDragStart = (job) => {
    setDraggedJob(job);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
  };
  const handleDropColumn = (targetStatusId) => {
    if (draggedJob && draggedJob.status !== targetStatusId) {
      handleUpdateJob(draggedJob.id, targetStatusId);
      setDraggedJob(null);
    }
  };
  const groupedJobs = STATUSES.reduce((acc, status) => {
    acc[status.id] = jobs.filter((j) => j.status === status.id);
    return acc;
  }, {});
  return /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto py-12 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-8", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 mb-2", children: "Job Application Tracker" }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-600", children: "Keep track of every application and stay on top of your job search" })
        ] }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setShowForm(!showForm),
            className: "flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors",
            children: [
              /* @__PURE__ */ jsx(Plus, { className: "w-5 h-5" }),
              " Add Application"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4", children: [
        { label: "Total Applied", value: (stats == null ? void 0 : stats.total) || 0, icon: TrendingUp, color: "text-blue-600" },
        { label: "Interviews", value: (stats == null ? void 0 : stats.interviews) || 0, icon: CheckCircle2, color: "text-amber-600" },
        { label: "Offers", value: (stats == null ? void 0 : stats.offers) || 0, icon: CheckCircle2, color: "text-green-600" },
        { label: "Reply Rate", value: `${(stats == null ? void 0 : stats.replyRate) || 0}%`, icon: TrendingUp, color: "text-purple-600" }
      ].map((stat, i) => /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-slate-500 uppercase mb-2", children: stat.label }),
        /* @__PURE__ */ jsx("p", { className: `text-2xl font-black ${stat.color}`, children: stat.value })
      ] }, i)) })
    ] }),
    showForm && /* @__PURE__ */ jsx("div", { className: "glass-card rounded-3xl p-6 mb-8", children: /* @__PURE__ */ jsxs("form", { onSubmit: handleAddJob, className: "space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            placeholder: "Company name",
            value: formData.company,
            onChange: (e) => setFormData({ ...formData, company: e.target.value }),
            className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            placeholder: "Job title",
            value: formData.role,
            onChange: (e) => setFormData({ ...formData, role: e.target.value }),
            className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        "select",
        {
          value: formData.status,
          onChange: (e) => setFormData({ ...formData, status: e.target.value }),
          className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
          children: STATUSES.map((s) => /* @__PURE__ */ jsx("option", { value: s.id, children: s.label }, s.id))
        }
      ),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          placeholder: "Notes (optional)",
          value: formData.notes,
          onChange: (e) => setFormData({ ...formData, notes: e.target.value }),
          className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
          rows: "2"
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsx("button", { type: "submit", className: "flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors", children: "Add Application" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowForm(false),
            className: "flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors",
            children: "Cancel"
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6", children: STATUSES.map((status) => {
      var _a, _b;
      return /* @__PURE__ */ jsxs(
        "div",
        {
          onDragOver: handleDragOver,
          onDrop: () => handleDropColumn(status.id),
          className: `glass-card rounded-3xl p-4 min-h-[24rem] transition-all duration-300 ${draggedJob && draggedJob.status !== status.id ? "ring-2 ring-blue-300 bg-blue-50/20" : ""}`,
          children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
              /* @__PURE__ */ jsx(status.icon, { className: `w-5 h-5 ${status.textColor}` }),
              /* @__PURE__ */ jsxs("h2", { className: "font-bold text-slate-900", children: [
                status.label,
                " ",
                /* @__PURE__ */ jsxs("span", { className: "text-slate-500", children: [
                  "(",
                  ((_a = groupedJobs[status.id]) == null ? void 0 : _a.length) || 0,
                  ")"
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-3 min-h-80", children: [
              (_b = groupedJobs[status.id]) == null ? void 0 : _b.map((job) => /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
                /* @__PURE__ */ jsx(JobCard$1, { job, status, onDelete: handleDeleteJob, onUpdate: handleUpdateJob, onDragStart: handleDragStart }),
                status.id !== "rejected" && /* @__PURE__ */ jsx("div", { className: "absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity", children: STATUSES.filter((s) => s.id !== status.id).map((nextStatus) => /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => handleUpdateJob(job.id, nextStatus.id),
                    className: "text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 m-0.5",
                    title: `Move to ${nextStatus.label}`,
                    children: nextStatus.label
                  },
                  nextStatus.id
                )) })
              ] }, job.id)),
              (!groupedJobs[status.id] || groupedJobs[status.id].length === 0) && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic py-8 text-center", children: "No applications yet" })
            ] })
          ]
        },
        status.id
      );
    }) })
  ] });
}
const SOURCES = [
  { value: "mock", label: "Sample Jobs (Demo)" },
  { value: "remotive", label: "Remotive (Remote Jobs)" },
  { value: "adzuna", label: "Adzuna (Local/Global Jobs)" }
];
function JobCard({ job, onAddToTracker, addedIds }) {
  const isAdded = addedIds.has(job.externalId);
  return /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl flex flex-col gap-3 hover:-translate-y-1 transition-all duration-300", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-base leading-snug truncate", children: job.title }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 mt-0.5", children: job.company })
      ] }),
      /* @__PURE__ */ jsx("span", { className: "shrink-0 text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full", children: job.source })
    ] }),
    job.location && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-sm text-slate-500", children: [
      /* @__PURE__ */ jsx(MapPin, { className: "w-4 h-4 shrink-0" }),
      /* @__PURE__ */ jsx("span", { className: "truncate", children: job.location })
    ] }),
    job.description && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 line-clamp-3 leading-relaxed", children: job.description.replace(/<[^>]*>/g, "") }),
    Array.isArray(job.tags) && job.tags.length > 0 && /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: job.tags.slice(0, 5).map((tag) => /* @__PURE__ */ jsx(
      "span",
      {
        className: "text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full",
        children: tag
      },
      tag
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 pt-1", children: [
      job.url && /* @__PURE__ */ jsxs(
        "a",
        {
          href: job.url,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 transition-colors",
          children: [
            /* @__PURE__ */ jsx(ExternalLink, { className: "w-4 h-4" }),
            "View Job"
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onAddToTracker(job),
          disabled: isAdded,
          className: `ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isAdded ? "bg-green-50 text-green-700 cursor-default" : "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800"}`,
          children: isAdded ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4" }),
            "Added"
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4" }),
            "Add to Tracker"
          ] })
        }
      )
    ] })
  ] });
}
function JobDiscovery() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState("mock");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultMeta, setResultMeta] = useState(null);
  const [addedIds, setAddedIds] = useState(/* @__PURE__ */ new Set());
  const [addError, setAddError] = useState("");
  const handleSearch = async (e) => {
    var _a, _b;
    e.preventDefault();
    setLoading(true);
    setError("");
    setJobs([]);
    setResultMeta(null);
    try {
      const params = new URLSearchParams({ source });
      if (query.trim()) params.set("query", query.trim());
      if (location.trim()) params.set("location", location.trim());
      const res = await api.get(`/jobs/discover?${params.toString()}`);
      const { jobs: fetched, count, source: usedSource } = res.data.data;
      setJobs(fetched);
      setResultMeta({ count, source: usedSource });
    } catch (err) {
      const msg = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Failed to fetch jobs. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };
  const handleAddToTracker = async (job) => {
    var _a, _b;
    setAddError("");
    try {
      await api.post("/jobs", {
        company: job.company || "Unknown Company",
        role: job.title,
        jobDescription: job.description || "",
        jobUrl: job.url || "",
        source: job.source,
        status: "applied"
      });
      setAddedIds((prev) => /* @__PURE__ */ new Set([...prev, job.externalId]));
    } catch (err) {
      const msg = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Failed to add job to tracker.";
      setAddError(msg);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto px-4 py-8 space-y-8", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("h1", { className: "text-3xl font-bold text-slate-900 flex items-center gap-3", children: [
        /* @__PURE__ */ jsx(Briefcase, { className: "w-8 h-8 text-indigo-600" }),
        "Job Discovery"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-slate-500", children: "Search and discover job opportunities from multiple sources, then add them directly to your tracker." })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSearch, className: "glass-card p-6 rounded-3xl space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "md:col-span-1", children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "query", className: "block text-sm font-medium text-slate-700 mb-1", children: "Job Title / Keywords" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "query",
                type: "text",
                value: query,
                onChange: (e) => setQuery(e.target.value),
                placeholder: "e.g. React Developer",
                className: "w-full bg-surface-container border border-outline/20 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-on-surface placeholder:text-outline/50"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "location", className: "block text-sm font-medium text-slate-700 mb-1", children: "Location" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(MapPin, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                id: "location",
                value: location,
                onChange: (e) => setLocation(e.target.value),
                className: "w-full bg-surface-container border border-outline/20 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none text-on-surface",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Any Location" }),
                  /* @__PURE__ */ jsx("option", { value: "Hyderabad", children: "Hyderabad" }),
                  /* @__PURE__ */ jsx("option", { value: "Bangalore", children: "Bangalore" }),
                  /* @__PURE__ */ jsx("option", { value: "Chennai", children: "Chennai" }),
                  /* @__PURE__ */ jsx("option", { value: "Mumbai", children: "Mumbai" }),
                  /* @__PURE__ */ jsx("option", { value: "Pune", children: "Pune" }),
                  /* @__PURE__ */ jsx("option", { value: "Delhi", children: "Delhi" })
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "source", className: "block text-sm font-medium text-slate-700 mb-1", children: "Source" }),
          /* @__PURE__ */ jsx(
            "select",
            {
              id: "source",
              value: source,
              onChange: (e) => setSource(e.target.value),
              className: "w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-on-surface",
              children: SOURCES.map((s) => /* @__PURE__ */ jsx("option", { value: s.value, children: s.label }, s.value))
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx(
        "button",
        {
          type: "submit",
          disabled: loading,
          className: "flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-indigo-700 active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0px_10px_20px_rgba(79,70,229,0.2)]",
          children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin" }),
            "Searching..."
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Search, { className: "w-4 h-4" }),
            "Search Jobs"
          ] })
        }
      ) })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 p-4 glass-card border-red-200/50 rounded-2xl text-red-700 text-sm font-medium", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 shrink-0" }),
      error
    ] }),
    addError && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 p-4 glass-card border-amber-200/50 rounded-2xl text-amber-700 text-sm font-medium", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 shrink-0" }),
      addError
    ] }),
    resultMeta && /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-500", children: [
        "Found ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-800", children: resultMeta.count }),
        " jobs",
        resultMeta.source !== source && /* @__PURE__ */ jsx("span", { className: "ml-1 text-amber-600", children: "(showing sample jobs — live API unavailable)" })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium", children: [
        "Source: ",
        resultMeta.source
      ] })
    ] }),
    jobs.length > 0 && /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: jobs.map((job) => /* @__PURE__ */ jsx(
      JobCard,
      {
        job,
        onAddToTracker: handleAddToTracker,
        addedIds
      },
      `${job.source}-${job.externalId}`
    )) }),
    resultMeta && jobs.length === 0 && /* @__PURE__ */ jsxs("div", { className: "text-center py-16 text-slate-400", children: [
      /* @__PURE__ */ jsx(Briefcase, { className: "w-12 h-12 mx-auto mb-3 opacity-40" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg font-medium", children: "No jobs found" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm mt-1", children: "Try a different query or source" })
    ] })
  ] });
}
function ResumeBuilder() {
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center", children: [
    /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "edit_document" }) }),
    /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold tracking-widest uppercase mb-4", children: "Coming Soon" }),
    /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Resume Builder" }),
    /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant max-w-xl leading-relaxed mb-8", children: "Build a professional resume from scratch using guided templates, section-by-section editing, and AI-powered suggestions — no design skills needed." }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mb-10", children: [
      { icon: "auto_awesome", label: "10+ Templates", desc: "ATS-friendly designs" },
      { icon: "smart_toy", label: "AI Writing", desc: "Bullet point generator" },
      { icon: "download", label: "PDF Export", desc: "One-click download" }
    ].map((f) => /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-2xl text-emerald-500 mb-2 block", style: { fontVariationSettings: "'FILL' 1" }, children: f.icon }),
      /* @__PURE__ */ jsx("p", { className: "font-bold text-on-surface text-sm", children: f.label }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-on-surface-variant mt-0.5", children: f.desc })
    ] }, f.label)) }),
    /* @__PURE__ */ jsxs(Link, { to: "/resume", className: "inline-flex items-center gap-2 text-emerald-600 font-bold text-sm hover:underline", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
      "In the meantime, try Resume Forge"
    ] })
  ] });
}
function ResumeHistory() {
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center", children: [
    /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-violet-600 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "history" }) }),
    /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 border border-violet-100 text-violet-600 text-xs font-bold tracking-widest uppercase mb-4", children: "Coming Soon" }),
    /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Resume History" }),
    /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant max-w-xl leading-relaxed mb-8", children: "Track every version of your resume, compare ATS scores over time, and see exactly how your profile has improved since day one." }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mb-10", children: [
      { icon: "timeline", label: "Score Timeline", desc: "Track improvements" },
      { icon: "compare", label: "Version Compare", desc: "Diff any two versions" },
      { icon: "cloud_done", label: "Cloud Storage", desc: "All versions saved" }
    ].map((f) => /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-2xl text-violet-500 mb-2 block", style: { fontVariationSettings: "'FILL' 1" }, children: f.icon }),
      /* @__PURE__ */ jsx("p", { className: "font-bold text-on-surface text-sm", children: f.label }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-on-surface-variant mt-0.5", children: f.desc })
    ] }, f.label)) }),
    /* @__PURE__ */ jsxs(Link, { to: "/resume", className: "inline-flex items-center gap-2 text-violet-600 font-bold text-sm hover:underline", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 0" }, children: "upload_file" }),
      "Analyze a new resume now"
    ] })
  ] });
}
function DiffView({ oldText, newText }) {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");
  const maxLines = Math.max(oldLines.length, newLines.length);
  return /* @__PURE__ */ jsx("div", { className: "space-y-2 font-mono text-sm", children: Array.from({ length: maxLines }).map((_, i) => {
    const oldLine = oldLines[i] || "";
    const newLine = newLines[i] || "";
    const isChanged = oldLine !== newLine;
    return /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
      /* @__PURE__ */ jsx("div", { className: `flex-1 p-2 rounded ${oldLine ? isChanged ? "bg-red-50" : "bg-slate-50" : ""}`, children: oldLine && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("span", { className: "text-red-600 font-semibold", children: "- " }),
        /* @__PURE__ */ jsx("span", { className: isChanged ? "text-red-700 line-through" : "text-slate-700", children: oldLine })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: `flex-1 p-2 rounded ${newLine ? isChanged ? "bg-green-50" : "bg-slate-50" : ""}`, children: newLine && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("span", { className: "text-green-600 font-semibold", children: "+ " }),
        /* @__PURE__ */ jsx("span", { className: isChanged ? "text-green-700 font-semibold" : "text-slate-700", children: newLine })
      ] }) })
    ] }, i);
  }) });
}
function StatDelta({ label, oldVal, newVal }) {
  const delta = newVal - oldVal;
  const isPositive = delta >= 0;
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-3 glass-card rounded-lg", children: [
    /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-slate-700", children: label }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("span", { className: "text-sm text-slate-500", children: oldVal }),
      /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "→" }),
      /* @__PURE__ */ jsx("span", { className: "text-sm font-bold text-slate-900", children: newVal }),
      delta !== 0 && /* @__PURE__ */ jsxs("span", { className: `text-xs font-bold px-2 py-1 rounded-full ${isPositive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`, children: [
        isPositive ? "+" : "",
        delta
      ] })
    ] })
  ] });
}
function ResumeComparison() {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState({ old: null, new: null });
  const [comparison, setComparison] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetchVersions();
  }, []);
  const fetchVersions = async () => {
    try {
      const { data } = await api.get("/resume/versions");
      setVersions(data);
    } catch (err) {
      console.error("Failed to fetch versions:", err);
    }
  };
  const handleCompare = async () => {
    if (!selected.old || !selected.new) return;
    try {
      const { data } = await api.post("/resume/compare", {
        versionId1: selected.old,
        versionId2: selected.new
      });
      setComparison(data);
    } catch (err) {
      console.error("Comparison failed:", err);
    }
  };
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  return /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto py-12 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs(Link, { to: "/resume/history", className: "flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-8", children: [
      /* @__PURE__ */ jsx(ChevronLeft, { className: "w-4 h-4" }),
      " Back to History"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-8", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 mb-2", children: "Compare Resume Versions" }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-600", children: "See what changed between two versions side-by-side" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 mb-8", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-slate-700 mb-2", children: "Original Version" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: selected.old || "",
            onChange: (e) => setSelected({ ...selected, old: e.target.value }),
            className: "w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none",
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Choose version..." }),
              versions.map((v) => /* @__PURE__ */ jsxs("option", { value: v.id, children: [
                v.name,
                " (",
                new Date(v.createdAt).toLocaleDateString(),
                ")"
              ] }, v.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-slate-700 mb-2", children: "New Version" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: selected.new || "",
            onChange: (e) => setSelected({ ...selected, new: e.target.value }),
            className: "w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none",
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Choose version..." }),
              versions.map((v) => /* @__PURE__ */ jsxs("option", { value: v.id, children: [
                v.name,
                " (",
                new Date(v.createdAt).toLocaleDateString(),
                ")"
              ] }, v.id))
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: handleCompare,
        disabled: !selected.old || !selected.new,
        className: "mb-8 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg",
        children: "Compare Versions"
      }
    ),
    comparison && /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-slate-900 mb-4", children: "Changes Summary" }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsx(StatDelta, { label: "Keywords", oldVal: ((_a = comparison.oldStats) == null ? void 0 : _a.keywords) || 0, newVal: ((_b = comparison.newStats) == null ? void 0 : _b.keywords) || 0 }),
          /* @__PURE__ */ jsx(StatDelta, { label: "Bullets", oldVal: ((_c = comparison.oldStats) == null ? void 0 : _c.bulletCount) || 0, newVal: ((_d = comparison.newStats) == null ? void 0 : _d.bulletCount) || 0 }),
          /* @__PURE__ */ jsx(StatDelta, { label: "Word Count", oldVal: ((_e = comparison.oldStats) == null ? void 0 : _e.wordCount) || 0, newVal: ((_f = comparison.newStats) == null ? void 0 : _f.wordCount) || 0 }),
          /* @__PURE__ */ jsx(StatDelta, { label: "ATS Score", oldVal: ((_g = comparison.oldStats) == null ? void 0 : _g.atsScore) || 0, newVal: ((_h = comparison.newStats) == null ? void 0 : _h.atsScore) || 0 })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-slate-900 mb-4", children: "Content Changes" }),
        /* @__PURE__ */ jsx("div", { className: "space-y-6", children: (_i = comparison.sections) == null ? void 0 : _i.map((section) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 mb-3", children: section.name }),
          /* @__PURE__ */ jsx(DiffView, { oldText: section.old, newText: section.new })
        ] }, section.name)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3 justify-center", children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => copyToClipboard(comparison.newContent),
            className: "flex items-center gap-2 px-6 py-3 glass-card hover:bg-white/40 text-on-surface rounded-xl font-bold transition-all",
            children: [
              copied ? /* @__PURE__ */ jsx(Check, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx(Copy, { className: "w-4 h-4" }),
              copied ? "Copied!" : "Copy New Version"
            ]
          }
        ),
        /* @__PURE__ */ jsxs("button", { className: "flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg", children: [
          /* @__PURE__ */ jsx(Download, { className: "w-4 h-4" }),
          " Download PDF"
        ] })
      ] })
    ] })
  ] });
}
function ResumeSend() {
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center", children: [
    /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-2xl bg-sky-100 flex items-center justify-center mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-sky-600 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "send" }) }),
    /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-100 text-sky-600 text-xs font-bold tracking-widest uppercase mb-4", children: "Coming Soon" }),
    /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Submit Your Resume" }),
    /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant max-w-xl leading-relaxed mb-8", children: "Send your resume directly to our expert reviewers and partner recruiters for personalised feedback, referrals, and job matching." }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mb-10", children: [
      { icon: "rate_review", label: "Expert Review", desc: "Human feedback in 48h" },
      { icon: "handshake", label: "Recruiter Match", desc: "Direct to hiring teams" },
      { icon: "notifications", label: "Status Updates", desc: "Real-time tracking" }
    ].map((f) => /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-2xl text-sky-500 mb-2 block", style: { fontVariationSettings: "'FILL' 1" }, children: f.icon }),
      /* @__PURE__ */ jsx("p", { className: "font-bold text-on-surface text-sm", children: f.label }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-on-surface-variant mt-0.5", children: f.desc })
    ] }, f.label)) }),
    /* @__PURE__ */ jsxs(Link, { to: "/resume", className: "inline-flex items-center gap-2 text-sky-600 font-bold text-sm hover:underline", children: [
      /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-base", style: { fontVariationSettings: "'FILL' 1" }, children: "auto_fix_high" }),
      "Optimize your resume first with Resume Forge"
    ] })
  ] });
}
function CareerRoadmap() {
  var _a, _b, _c;
  const [step, setStep] = useState("form");
  const [formData, setFormData] = useState({
    currentRole: "",
    targetRole: "",
    currentSkills: "",
    timeframe: "6months"
  });
  const [roadmap, setRoadmap] = useState(null);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generatingRef = useRef(false);
  useEffect(() => {
    loadSavedRoadmap();
  }, []);
  async function loadSavedRoadmap() {
    try {
      const { data } = await api.get("/career/roadmap");
      setRoadmap(data.roadmap || data);
      setStep("display");
    } catch (err) {
      setStep("form");
    }
  }
  async function handleGenerateRoadmap(e) {
    var _a2, _b2;
    e.preventDefault();
    setError("");
    if (generatingRef.current || loading) return;
    if (!formData.targetRole.trim()) {
      setError("Target role is required");
      return;
    }
    generatingRef.current = true;
    setLoading(true);
    setStep("generating");
    try {
      const skillsArray = formData.currentSkills.split(",").map((s) => s.trim()).filter(Boolean);
      const { data } = await api.post("/career/roadmap", {
        currentRole: formData.currentRole,
        targetRole: formData.targetRole,
        currentSkills: skillsArray,
        timeframe: formData.timeframe
      });
      setRoadmap(data);
      setStep("display");
      setExpandedPhases({});
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.error) || "Failed to generate roadmap");
      setStep("form");
    } finally {
      generatingRef.current = false;
      setLoading(false);
    }
  }
  const togglePhase = (phaseNum) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseNum]: !prev[phaseNum]
    }));
  };
  if (step === "form") {
    return /* @__PURE__ */ jsx("div", { className: "w-full py-12 px-4", children: /* @__PURE__ */ jsx("div", { className: "max-w-2xl mx-auto", children: /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold text-slate-900 dark:text-white mb-2", children: "Career Roadmap" }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-400 mb-8", children: "Get a personalized 3-12 month plan to reach your career goals" }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleGenerateRoadmap, className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2", children: "Current Role (optional)" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              placeholder: "e.g., Junior Developer, Fresher, Intern",
              value: formData.currentRole,
              onChange: (e) => setFormData({ ...formData, currentRole: e.target.value }),
              className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2", children: "Target Role *" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              placeholder: "e.g., Senior Frontend Developer, Full Stack Engineer",
              value: formData.targetRole,
              onChange: (e) => setFormData({ ...formData, targetRole: e.target.value }),
              className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2", children: "Current Skills (comma-separated, optional)" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              placeholder: "e.g., React, Node.js, JavaScript, CSS",
              value: formData.currentSkills,
              onChange: (e) => setFormData({ ...formData, currentSkills: e.target.value }),
              rows: 3,
              className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2", children: "How long do you have?" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: formData.timeframe,
              onChange: (e) => setFormData({ ...formData, timeframe: e.target.value }),
              className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "3months", children: "3 months" }),
                /* @__PURE__ */ jsx("option", { value: "6months", children: "6 months" }),
                /* @__PURE__ */ jsx("option", { value: "1year", children: "1 year" })
              ]
            }
          )
        ] }),
        error && /* @__PURE__ */ jsx("div", { className: "p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300", children: error }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: loading,
            className: "w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg",
            children: loading ? "Generating..." : "Generate My Roadmap"
          }
        )
      ] })
    ] }) }) });
  }
  if (step === "generating") {
    return /* @__PURE__ */ jsx("div", { className: "w-full py-12 px-4 flex items-center justify-center min-h-[60vh]", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 mb-6 animate-spin", children: /* @__PURE__ */ jsx(Loader, { className: "w-8 h-8 text-white" }) }),
      /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-900 dark:text-white mb-2", children: "Generating Your Roadmap" }),
      /* @__PURE__ */ jsxs("p", { className: "text-slate-600 dark:text-slate-400", children: [
        "Creating a personalized path to ",
        formData.targetRole,
        "..."
      ] })
    ] }) });
  }
  if (!roadmap) return null;
  return /* @__PURE__ */ jsx("div", { className: "w-full py-12 px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-4xl mx-auto", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-12", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-bold text-slate-900 dark:text-white mb-3", children: roadmap.title }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-600 dark:text-slate-400 mb-6", children: roadmap.summary }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-2xl p-4", children: [
          /* @__PURE__ */ jsx("div", { className: "text-sm text-slate-600 dark:text-slate-400", children: "Estimated Hours" }),
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-blue-600", children: roadmap.estimatedHours || 200 })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-2xl p-4", children: [
          /* @__PURE__ */ jsx("div", { className: "text-sm text-slate-600 dark:text-slate-400", children: "Phases" }),
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-blue-600", children: ((_a = roadmap.phases) == null ? void 0 : _a.length) || 3 })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-2xl p-4", children: [
          /* @__PURE__ */ jsx("div", { className: "text-sm text-slate-600 dark:text-slate-400", children: "Key Milestones" }),
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-blue-600", children: ((_b = roadmap.keyMetrics) == null ? void 0 : _b.length) || 4 })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-4 mb-12", children: (_c = roadmap.phases) == null ? void 0 : _c.map((phase, idx) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: "glass-card rounded-3xl overflow-hidden",
        children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => togglePhase(idx),
              className: "w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors",
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 text-left", children: [
                  /* @__PURE__ */ jsx("div", { className: "flex-shrink-0", children: /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-semibold", children: phase.phase }) }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900 dark:text-white", children: phase.title }),
                    /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400", children: phase.duration })
                  ] })
                ] }),
                expandedPhases[idx] ? /* @__PURE__ */ jsx(ChevronUp, { className: "w-5 h-5 text-slate-500" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "w-5 h-5 text-slate-500" })
              ]
            }
          ),
          expandedPhases[idx] && /* @__PURE__ */ jsxs("div", { className: "border-t border-slate-200 dark:border-slate-700 px-6 py-4 space-y-4", children: [
            /* @__PURE__ */ jsx("p", { className: "text-slate-700 dark:text-slate-300", children: phase.description }),
            phase.goals && phase.goals.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "font-semibold text-slate-900 dark:text-white mb-2", children: "Goals" }),
              /* @__PURE__ */ jsx("ul", { className: "space-y-1", children: phase.goals.map((goal, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2 text-slate-700 dark:text-slate-300", children: [
                /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" }),
                goal
              ] }, i)) })
            ] }),
            phase.skills && phase.skills.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "font-semibold text-slate-900 dark:text-white mb-2", children: "Skills to Learn" }),
              /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: phase.skills.map((skill, i) => /* @__PURE__ */ jsx(
                "span",
                {
                  className: "px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm",
                  children: skill
                },
                i
              )) })
            ] }),
            phase.projects && phase.projects.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "font-semibold text-slate-900 dark:text-white mb-2", children: "Projects" }),
              /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: phase.projects.map((project, i) => /* @__PURE__ */ jsxs("li", { className: "p-3 bg-slate-50 dark:bg-slate-700 rounded-lg", children: [
                /* @__PURE__ */ jsx("p", { className: "font-medium text-slate-900 dark:text-white", children: project.name }),
                /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400", children: project.description }),
                /* @__PURE__ */ jsx("span", { className: "inline-block mt-1 text-xs px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded", children: project.difficulty })
              ] }, i)) })
            ] }),
            phase.resources && phase.resources.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "font-semibold text-slate-900 dark:text-white mb-2", children: "Resources" }),
              /* @__PURE__ */ jsx("ul", { className: "space-y-1", children: phase.resources.map((resource, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-slate-700 dark:text-slate-300", children: [
                /* @__PURE__ */ jsx(ExternalLink, { className: "w-4 h-4 flex-shrink-0" }),
                /* @__PURE__ */ jsx("span", { className: "text-sm", children: resource.title }),
                /* @__PURE__ */ jsx("span", { className: "text-xs px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded", children: resource.type })
              ] }, i)) })
            ] })
          ] })
        ]
      },
      idx
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "grid md:grid-cols-2 gap-6 mb-8", children: [
      roadmap.tips && roadmap.tips.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900 dark:text-white mb-4", children: "💡 Tips for Success" }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: roadmap.tips.map((tip, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2 text-slate-700 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx("span", { className: "text-yellow-500 flex-shrink-0", children: "→" }),
          tip
        ] }, i)) })
      ] }),
      roadmap.keyMetrics && roadmap.keyMetrics.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900 dark:text-white mb-4", children: "📊 Track Progress" }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: roadmap.keyMetrics.map((metric, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-slate-700 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", className: "w-4 h-4 rounded border-slate-300" }),
          metric
        ] }, i)) })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => {
          setStep("form");
          setError("");
        },
        className: "w-full glass-card hover:bg-white/40 text-on-surface font-bold py-3 px-4 rounded-2xl transition-all",
        children: "Generate New Roadmap"
      }
    )
  ] }) });
}
const SCORE_BANDS = [
  { min: 90, label: "Excellent — very likely to pass ATS", color: "#10b981" },
  { min: 80, label: "Good — likely to pass ATS", color: "#3b82f6" },
  { min: 70, label: "Fair — may pass ATS", color: "#f59e0b" },
  { min: 60, label: "Poor — unlikely to pass ATS", color: "#ef4444" },
  { min: 0, label: "Critical — will likely be filtered", color: "#991b1b" }
];
function getScoreBand(score) {
  return SCORE_BANDS.find((band) => score >= band.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
}
const SCORE_BREAKDOWN_ITEMS = [
  { key: "contact", label: "Contact Information", max: 10 },
  { key: "structure", label: "Structure", max: 20 },
  { key: "formatting", label: "ATS Formatting", max: 20 },
  { key: "skills", label: "Skills", max: 15 },
  { key: "experience", label: "Experience", max: 15 },
  { key: "projects", label: "Projects", max: 10 },
  { key: "education", label: "Education", max: 5 },
  { key: "readability", label: "Readability", max: 5 }
];
const SEVERITY_STYLES$1 = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600"
};
function ATSCheckerV2() {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeFileName, setResumeFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("input");
  const [dragActive, setDragActive] = useState(false);
  const validateAndSetFile = (file) => {
    if (!file) return;
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!allowed.includes(file.type)) {
      setError("Only PDF, DOCX, and TXT files allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large (max 5MB)");
      return;
    }
    setResumeFile(file);
    setResumeFileName(file.name);
    setError("");
  };
  const handleResumeUpload = (e) => {
    var _a2;
    validateAndSetFile((_a2 = e.target.files) == null ? void 0 : _a2[0]);
  };
  const handleDrop = (e) => {
    var _a2;
    e.preventDefault();
    setDragActive(false);
    validateAndSetFile((_a2 = e.dataTransfer.files) == null ? void 0 : _a2[0]);
  };
  const handleCheck = async () => {
    var _a2, _b2;
    if (!resumeFile) {
      setError("Please upload a resume");
      return;
    }
    setError("");
    setLoading(true);
    setResults(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Please log in to use this feature");
        setLoading(false);
        return;
      }
      const formData = new FormData();
      formData.append("resume", resumeFile);
      const parseResponse = await axios.post("/api/ats/v2/parse", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "Authorization": `Bearer ${token}`
        }
      });
      if (!parseResponse.data.resumeText) {
        throw new Error("Failed to parse resume");
      }
      const resumeText = parseResponse.data.resumeText;
      const response = await axios.post("/api/resume/v2/analyze", {
        resumeText
      }, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.data.status === "success") {
        setResults(response.data);
        setActiveTab("results");
      }
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.message) || err.message || "Analysis failed");
      console.error("Analysis error:", err);
    } finally {
      setLoading(false);
    }
  };
  const overallScore = ((_a = results == null ? void 0 : results.analysis) == null ? void 0 : _a.overallScore) ?? 0;
  const scoreBand = getScoreBand(overallScore);
  const circumference = 2 * Math.PI * 45;
  return /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8 w-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-widest mb-2", children: [
        /* @__PURE__ */ jsx(Zap, { className: "w-4 h-4 fill-current" }),
        " Resume Tools"
      ] }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 tracking-tight", children: "ATS Score Checker" }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-2 font-medium", children: "A fully rule-based, deterministic ATS compliance and resume quality report — no AI involved in scoring." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2 mb-8 glass-card rounded-2xl p-2 w-fit", children: [
      { id: "input", label: "Input", disabled: false },
      { id: "results", label: "Report", disabled: !results }
    ].map((tab) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => setActiveTab(tab.id),
        disabled: tab.disabled,
        className: `relative px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === tab.id ? "bg-blue-600 text-white shadow-md" : tab.disabled ? "text-slate-300 cursor-not-allowed" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`,
        children: tab.label
      },
      tab.id
    )) }),
    activeTab === "input" && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 sm:p-10", children: [
      /* @__PURE__ */ jsxs(
        "label",
        {
          htmlFor: "resume",
          onDragOver: (e) => {
            e.preventDefault();
            setDragActive(true);
          },
          onDragLeave: () => setDragActive(false),
          onDrop: handleDrop,
          className: `flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-16 px-6 cursor-pointer transition-all duration-200 ${dragActive ? "border-blue-500 bg-blue-50" : resumeFileName ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/40"}`,
          children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "resume",
                type: "file",
                accept: ".pdf,.docx,.txt",
                onChange: handleResumeUpload,
                className: "hidden"
              }
            ),
            resumeFileName ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center", children: /* @__PURE__ */ jsx(FileText, { className: "w-7 h-7" }) }),
              /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 break-all text-center", children: resumeFileName }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400 font-medium", children: "Click to choose a different file" })
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center", children: /* @__PURE__ */ jsx(UploadCloud, { className: "w-7 h-7" }) }),
              /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900", children: "Click to upload or drag & drop" }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400 font-medium", children: "PDF, DOCX, or TXT — max 5MB" })
            ] })
          ]
        }
      ),
      error && /* @__PURE__ */ jsxs("div", { className: "mt-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl font-medium text-sm", children: [
        /* @__PURE__ */ jsx(AlertTriangle, { className: "w-5 h-5 shrink-0 mt-0.5" }),
        /* @__PURE__ */ jsx("span", { children: error })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleCheck,
          disabled: loading || !resumeFile,
          className: "mt-6 w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] shadow-lg shadow-blue-600/20 disabled:shadow-none",
          children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Loader2, { className: "w-5 h-5 animate-spin" }),
            "Analyzing Resume..."
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            "Check ATS Score",
            /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
          ] })
        }
      )
    ] }),
    activeTab === "results" && results && /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 items-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative w-44 h-44 mx-auto", children: [
          /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 100 100", className: "w-full h-full -rotate-90", children: [
            /* @__PURE__ */ jsx("circle", { cx: "50", cy: "50", r: "45", fill: "none", stroke: "#e5e7eb", strokeWidth: "8" }),
            /* @__PURE__ */ jsx(
              "circle",
              {
                cx: "50",
                cy: "50",
                r: "45",
                fill: "none",
                stroke: scoreBand.color,
                strokeWidth: "8",
                strokeLinecap: "round",
                strokeDasharray: `${overallScore / 100 * circumference} ${circumference}`,
                style: { transition: "stroke-dasharray 0.6s ease" }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
            /* @__PURE__ */ jsx("span", { className: "text-4xl font-black text-slate-900", children: overallScore }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-bold text-slate-400", children: "/100" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-xl font-black text-slate-900 mb-1", children: "ATS Score" }),
          /* @__PURE__ */ jsx("p", { className: "font-bold mb-3", style: { color: scoreBand.color }, children: scoreBand.label }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-500 font-medium mb-6", children: [
            "Detected Role: ",
            /* @__PURE__ */ jsx("span", { className: "font-bold text-slate-900", children: (_b = results.analysis.detectedRole) == null ? void 0 : _b.displayName }),
            " ",
            /* @__PURE__ */ jsxs("span", { className: "text-slate-400", children: [
              "(",
              (_c = results.analysis.detectedRole) == null ? void 0 : _c.confidence,
              "% confidence)"
            ] }),
            " • ",
            "Completeness: ",
            /* @__PURE__ */ jsxs("span", { className: "font-bold text-slate-900", children: [
              (_d = results.analysis.summary) == null ? void 0 : _d.completeness,
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3", children: SCORE_BREAKDOWN_ITEMS.map((item) => {
            var _a2;
            const value = ((_a2 = results.analysis.scores) == null ? void 0 : _a2[item.key]) ?? 0;
            const pct = Math.min(100, value / item.max * 100);
            return /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[1fr_auto] sm:grid-cols-[140px_1fr_70px] items-center gap-3", children: [
              /* @__PURE__ */ jsx("span", { className: "text-sm font-bold text-slate-600 col-span-2 sm:col-span-1", children: item.label }),
              /* @__PURE__ */ jsx("div", { className: "h-2.5 bg-slate-100 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx(
                "div",
                {
                  className: "h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700",
                  style: { width: `${pct}%` }
                }
              ) }),
              /* @__PURE__ */ jsxs("span", { className: "text-sm font-bold text-blue-600 text-right", children: [
                value,
                "/",
                item.max
              ] })
            ] }, item.key);
          }) })
        ] })
      ] }),
      ((_e = results.analysis) == null ? void 0 : _e.contactInfo) && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxs("h3", { className: "font-black text-slate-900 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(CheckCircle2, { className: "w-5 h-5 text-blue-600" }),
            " Contact Information"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "text-sm font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full", children: [
            results.analysis.contactInfo.score,
            "/",
            results.analysis.contactInfo.maxScore
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: Object.entries(results.analysis.contactInfo.found || {}).map(([field, present]) => /* @__PURE__ */ jsxs(
          "span",
          {
            className: `text-xs font-bold px-3 py-1.5 rounded-full capitalize ${present ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`,
            children: [
              present ? "✓" : "✕",
              " ",
              field
            ]
          },
          field
        )) })
      ] }),
      ((_f = results.analysis) == null ? void 0 : _f.quality) && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
          /* @__PURE__ */ jsxs("h3", { className: "font-black text-slate-900 mb-4 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(CheckCircle2, { className: "w-5 h-5 text-emerald-500" }),
            " Strengths"
          ] }),
          ((_g = results.analysis.quality.keyStrengths) == null ? void 0 : _g.length) > 0 ? /* @__PURE__ */ jsx("ul", { className: "space-y-2.5", children: results.analysis.quality.keyStrengths.map((s, i) => /* @__PURE__ */ jsxs("li", { className: "text-sm text-slate-600 font-medium flex items-start gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" }),
            s
          ] }, i)) }) : /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400 font-medium", children: "No standout strengths detected yet." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
          /* @__PURE__ */ jsxs("h3", { className: "font-black text-slate-900 mb-4 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(AlertTriangle, { className: "w-5 h-5 text-amber-500" }),
            " Weaknesses"
          ] }),
          ((_h = results.analysis.quality.keyWeaknesses) == null ? void 0 : _h.length) > 0 ? /* @__PURE__ */ jsx("ul", { className: "space-y-2.5", children: results.analysis.quality.keyWeaknesses.map((w, i) => /* @__PURE__ */ jsxs("li", { className: "text-sm text-slate-600 font-medium flex items-start gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" }),
            w
          ] }, i)) }) : /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400 font-medium", children: "No major issues found." })
        ] })
      ] }),
      ((_j = (_i = results.analysis) == null ? void 0 : _i.issues) == null ? void 0 : _j.length) > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
        /* @__PURE__ */ jsxs("h3", { className: "font-black text-slate-900 mb-4 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(ShieldAlert, { className: "w-5 h-5 text-red-500" }),
          " Issues Found (",
          results.analysis.issues.length,
          ")"
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-2.5", children: results.analysis.issues.map((issue, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-3 text-sm", children: [
          /* @__PURE__ */ jsx("span", { className: `shrink-0 text-xs font-bold px-2 py-1 rounded-full capitalize ${SEVERITY_STYLES$1[issue.severity] || SEVERITY_STYLES$1.low}`, children: issue.severity }),
          /* @__PURE__ */ jsx("span", { className: "text-slate-600 font-medium pt-0.5", children: issue.message })
        ] }, i)) })
      ] }),
      ((_l = (_k = results.analysis) == null ? void 0 : _k.recommendations) == null ? void 0 : _l.length) > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6", children: [
        /* @__PURE__ */ jsxs("h3", { className: "font-black text-slate-900 mb-4 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(ListChecks, { className: "w-5 h-5 text-blue-600" }),
          " Recommended Improvements (",
          results.analysis.recommendations.length,
          ")"
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-4", children: results.analysis.recommendations.map((rec, i) => /* @__PURE__ */ jsxs("li", { className: "bg-white/60 rounded-2xl p-4", children: [
          /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 text-sm mb-1", children: rec.message }),
          rec.reason && rec.reason !== rec.message && /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 font-medium", children: [
            "Reason: ",
            rec.reason
          ] })
        ] }, i)) })
      ] })
    ] })
  ] });
}
function JobAnalyzer() {
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const handleAnalyze = async (e) => {
    var _a, _b;
    e.preventDefault();
    if (!jobDescription.trim()) {
      setError("Job description is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/jobs/analyze-description", {
        jobDescription
      });
      setResult(data.data);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Failed to analyze job description");
    } finally {
      setLoading(false);
    }
  };
  const loadTestData = () => {
    const testJobDescription = `Senior Full Stack Engineer - Remote

About Us
TechCorp is a fast-growing SaaS company specializing in AI-powered analytics. We're looking for talented engineers to help us scale our platform to serve thousands of customers worldwide.

About the Role
We are seeking a Senior Full Stack Engineer to join our 15-person engineering team. You will own full product features from concept to production, working across our React frontend and Node.js backend. You'll have the opportunity to mentor junior developers and shape our technical culture.

Key Responsibilities
- Design and develop new features for our web application using React and Node.js
- Optimize database queries and API performance for millions of users
- Implement and maintain automated testing and CI/CD pipelines
- Participate in architectural decisions and design reviews
- Mentor junior engineers and conduct code reviews
- Troubleshoot production issues and implement monitoring solutions
- Collaborate with product and design teams to deliver exceptional user experiences

Required Qualifications
- 5+ years of professional software development experience
- Strong proficiency in JavaScript/TypeScript
- Demonstrated expertise in React and modern frontend frameworks
- Backend experience with Node.js, Express, or similar frameworks
- Solid understanding of SQL and NoSQL databases (PostgreSQL, MongoDB)
- Experience with REST APIs and microservices architecture
- Familiarity with Docker and AWS or similar cloud platforms
- Experience with Git and collaborative development workflows
- Strong problem-solving and communication skills

Nice-to-Have Qualifications
- Experience with GraphQL
- Kubernetes and container orchestration
- AWS certifications or GCP experience
- Open source contributions
- Experience with payment processing systems
- Knowledge of data pipeline and ETL tools

Compensation & Benefits
- Competitive salary: $130,000 - $180,000 based on experience
- 100% remote work
- Comprehensive health insurance
- 401(k) with company matching
- Unlimited PTO
- $3,000 annual professional development budget
- Equity options

Location
Remote (US-based preferred, but global candidates considered)`;
    setJobDescription(testJobDescription);
    setError("");
    setResult(null);
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-900 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "work" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Job Description Analyzer" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Paste a job description to extract skills, experience requirements, and key responsibilities." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mb-12 glass-card border-purple-200/50 rounded-3xl p-8", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-purple-600", children: "info" }),
        "How It Works"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-slate-700 dark:text-slate-300", children: [
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "1. Paste Job Description:" }),
          " Copy the complete job posting (including all requirements, responsibilities, and qualifications)"
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("p", { className: "mb-2", children: [
            /* @__PURE__ */ jsx("strong", { children: "2. AI Analysis:" }),
            " Our AI analyzes the posting and extracts:"
          ] }),
          /* @__PURE__ */ jsxs("ul", { className: "list-disc list-inside ml-4 space-y-1", children: [
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Required Skills:" }),
              " Must-have technical skills for the role"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Nice-to-Have Skills:" }),
              " Bonus skills that are preferred but not required"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Seniority Level:" }),
              " Junior, Mid, or Senior"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Experience Required:" }),
              " Years of experience needed"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Key Responsibilities:" }),
              " Main duties of the position"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Keywords & Concepts:" }),
              " Important tools, frameworks, and concepts"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "3. Use Results:" }),
          " Compare with your skills to identify gaps and prepare accordingly"
        ] })
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 flex-shrink-0" }),
      error
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleAnalyze, className: "max-w-3xl mx-auto mb-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-3", children: "Job Description" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: jobDescription,
            onChange: (e) => setJobDescription(e.target.value),
            placeholder: "Paste the complete job posting here...",
            rows: 12,
            className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          }
        ),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-400 mt-2", children: [
          jobDescription.length,
          " characters"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mt-6 flex flex-col sm:flex-row gap-3 justify-center", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: loading,
            className: "px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-3",
            children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
              "Analyzing..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "analytics" }),
              "Analyze Job Description"
            ] })
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: loadTestData,
            className: "px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-2xl font-bold transition-all flex items-center justify-center gap-3",
            children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "dataset" }),
              "Load Test Data"
            ]
          }
        )
      ] })
    ] }),
    result && !loading && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto space-y-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card border-blue-500/20 rounded-2xl p-6", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-2", children: "Seniority Level" }),
          /* @__PURE__ */ jsx("p", { className: "text-2xl font-black text-blue-700 dark:text-blue-300", children: result.seniority })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card border-purple-500/20 rounded-2xl p-6", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-2", children: "Experience" }),
          /* @__PURE__ */ jsx("p", { className: "text-lg font-black text-purple-700 dark:text-purple-300", children: result.experienceLevel })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "glass-card border-amber-500/20 rounded-2xl p-6", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-amber-600 dark:text-amber-400 uppercase mb-2", children: "Salary Range" }),
          /* @__PURE__ */ jsx("p", { className: "text-lg font-black text-amber-700 dark:text-amber-300", children: result.salaryRange })
        ] })
      ] }),
      result.requiredSkills.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
          /* @__PURE__ */ jsx(Code2, { className: "w-6 h-6 text-emerald-600" }),
          /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface", children: "Required Skills" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: result.requiredSkills.map((skill) => /* @__PURE__ */ jsx("span", { className: "px-4 py-2 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold text-sm", children: skill }, skill)) })
      ] }),
      result.niceToHaveSkills.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
          /* @__PURE__ */ jsx(Code2, { className: "w-6 h-6 text-blue-600" }),
          /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface", children: "Nice-to-Have Skills" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: result.niceToHaveSkills.map((skill) => /* @__PURE__ */ jsx("span", { className: "px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full font-semibold text-sm", children: skill }, skill)) })
      ] }),
      result.responsibilities.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
          /* @__PURE__ */ jsx(Briefcase, { className: "w-6 h-6 text-purple-600" }),
          /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface", children: "Key Responsibilities" })
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: result.responsibilities.map((resp, i) => /* @__PURE__ */ jsxs("li", { className: "flex gap-3 text-slate-700 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx("span", { className: "text-purple-600 font-bold flex-shrink-0", children: "•" }),
          /* @__PURE__ */ jsx("span", { children: resp })
        ] }, i)) })
      ] }),
      result.keywords.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
          /* @__PURE__ */ jsx(Users, { className: "w-6 h-6 text-blue-600" }),
          /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface", children: "Key Concepts & Tools" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: result.keywords.map((keyword) => /* @__PURE__ */ jsx("span", { className: "px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium", children: keyword }, keyword)) })
      ] })
    ] })
  ] });
}
function CoverLetterGenerator() {
  const [formData, setFormData] = useState({
    companyName: "",
    position: "",
    yourName: "",
    jobDescription: "",
    experience: "",
    tone: "formal"
  });
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };
  const handleGenerate = async (e) => {
    var _a, _b;
    e.preventDefault();
    if (!formData.companyName || !formData.position || !formData.yourName || !formData.jobDescription) {
      setError("Please fill in all required fields");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/jobs/generate-cover-letter", formData);
      setLetter(data.data);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Failed to generate cover letter");
    } finally {
      setLoading(false);
    }
  };
  const handleCopy = () => {
    navigator.clipboard.writeText(letter.letterText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([letter.letterText], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `cover-letter-${formData.companyName.replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  const loadTestData = () => {
    setFormData({
      companyName: "TechCorp",
      position: "Senior Software Engineer",
      yourName: "John Doe",
      jobDescription: `Senior Software Engineer - Full Stack

About Us
TechCorp is a fast-growing SaaS company specializing in AI-powered analytics. We're looking for talented engineers to help us scale our platform.

Key Responsibilities
- Design and develop new features using React and Node.js
- Optimize database queries and API performance
- Implement CI/CD pipelines
- Mentor junior engineers
- Troubleshoot production issues

Required Qualifications
- 5+ years of professional software development
- Strong proficiency in JavaScript/TypeScript
- React and Node.js expertise
- SQL and NoSQL database experience
- Docker and AWS knowledge
- REST API and microservices architecture experience

Nice-to-Have
- GraphQL experience
- Kubernetes knowledge
- AWS certifications
- Open source contributions

Compensation
- Salary: $130,000 - $180,000
- 100% remote
- Full benefits package
- Unlimited PTO`,
      experience: "I have 6 years of full-stack development experience. At my current company, I led the development of a microservices architecture that improved performance by 40%. I'm proficient in React, Node.js, TypeScript, and have extensive experience with AWS and Docker. I've also mentored 3 junior developers on best practices and code quality.",
      tone: "formal"
    });
    setLetter(null);
    setError("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-900 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "mail" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Cover Letter Generator" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Generate a personalized cover letter for any job application in seconds." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto mb-12 glass-card border-emerald-200/50 rounded-3xl p-8", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600", children: "info" }),
        "How It Works"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-slate-700 dark:text-slate-300", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "mb-2", children: /* @__PURE__ */ jsx("strong", { children: "1. Fill in Your Details:" }) }),
          /* @__PURE__ */ jsxs("ul", { className: "list-disc list-inside ml-4 space-y-1", children: [
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Company Name:" }),
              " The company you're applying to"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Position Title:" }),
              " The job title you're applying for"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Your Name:" }),
              " Your full name for the signature"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Job Description:" }),
              " Copy-paste the complete job posting"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Your Background:" }),
              " Brief description of your relevant experience (optional but recommended)"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Tone:" }),
              " Choose between Formal, Friendly, or Confident"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "2. AI Generation:" }),
          " Our AI creates a personalized, compelling cover letter (3-4 paragraphs) tailored to the specific job and company"
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "3. Use Immediately:" }),
          " Copy the letter to your clipboard or download it as a text file. Customize as needed and send with your application"
        ] })
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 flex-shrink-0" }),
      error
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [
      /* @__PURE__ */ jsxs("form", { onSubmit: handleGenerate, className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Company Name *" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "companyName",
              value: formData.companyName,
              onChange: handleInputChange,
              placeholder: "e.g., Google, Microsoft",
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Position Title *" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "position",
              value: formData.position,
              onChange: handleInputChange,
              placeholder: "e.g., Senior Software Engineer",
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Your Full Name *" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              name: "yourName",
              value: formData.yourName,
              onChange: handleInputChange,
              placeholder: "e.g., John Doe",
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Your Background" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              name: "experience",
              value: formData.experience,
              onChange: handleInputChange,
              placeholder: "Describe your relevant experience (optional)...",
              rows: 4,
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Tone" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              name: "tone",
              value: formData.tone,
              onChange: handleInputChange,
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface focus:ring-1 focus:ring-blue-500 outline-none",
              children: [
                /* @__PURE__ */ jsx("option", { value: "formal", children: "Formal & Professional" }),
                /* @__PURE__ */ jsx("option", { value: "friendly", children: "Friendly & Warm" }),
                /* @__PURE__ */ jsx("option", { value: "confident", children: "Confident & Bold" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Job Description *" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              name: "jobDescription",
              value: formData.jobDescription,
              onChange: handleInputChange,
              placeholder: "Paste the job posting here...",
              rows: 6,
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: loading,
              className: "px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-3",
              children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
                "Generating..."
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "mail" }),
                "Generate Cover Letter"
              ] })
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: loadTestData,
              className: "px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-xl font-bold transition-all flex items-center justify-center gap-3",
              children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "dataset" }),
                "Load Test Data"
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "h-full", children: letter ? /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 h-full flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700", children: [
          /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-on-surface", children: "Generated Letter" }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: handleCopy,
                className: "p-2 hover:bg-surface-container/50 rounded-lg transition-colors",
                title: "Copy",
                children: copied ? /* @__PURE__ */ jsx(CheckCircle, { className: "w-5 h-5 text-emerald-600" }) : /* @__PURE__ */ jsx(Copy, { className: "w-5 h-5 text-slate-600" })
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: handleDownload,
                className: "p-2 hover:bg-surface-container/50 rounded-lg transition-colors",
                title: "Download",
                children: /* @__PURE__ */ jsx(Download, { className: "w-5 h-5 text-slate-600" })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto prose dark:prose-invert prose-sm max-w-none", children: /* @__PURE__ */ jsx("div", { className: "whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed", children: letter.letterText }) }),
        /* @__PURE__ */ jsx("div", { className: "mt-6 pt-6 border-t border-slate-200 dark:border-slate-700", children: /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-400", children: [
          "Generated at ",
          new Date(letter.generatedAt).toLocaleString()
        ] }) })
      ] }) : /* @__PURE__ */ jsx("div", { className: "glass-card bg-surface-container/30 rounded-3xl p-8 h-full flex items-center justify-center border-2 border-dashed border-outline/20", children: /* @__PURE__ */ jsx("p", { className: "text-center text-slate-500 dark:text-slate-400", children: 'Fill in the form and click "Generate Cover Letter" to see your personalized letter here.' }) }) })
    ] })
  ] });
}
function DiversityGauge({ score }) {
  const color = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-rose-400";
  const bgColor = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-rose-500";
  const label = score >= 75 ? "High" : score >= 50 ? "Medium" : "Low";
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "relative w-32 h-32", children: [
      /* @__PURE__ */ jsxs("svg", { className: "w-32 h-32 -rotate-90", viewBox: "0 0 36 36", children: [
        /* @__PURE__ */ jsx("circle", { cx: "18", cy: "18", r: "15.9", fill: "none", stroke: "#1e293b", strokeWidth: "3" }),
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "18",
            cy: "18",
            r: "15.9",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "3",
            strokeDasharray: `${score} ${100 - score}`,
            className: color
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsx("span", { className: `text-2xl font-bold ${color}`, children: score }) })
    ] }),
    /* @__PURE__ */ jsxs("span", { className: `text-sm font-medium px-2 py-0.5 rounded-full ${bgColor} text-white`, children: [
      label,
      " Diversity"
    ] })
  ] });
}
function BulletHeatmapRow({ bullet, count, maxCount, variant }) {
  const intensity = maxCount > 0 ? count / maxCount : 0;
  return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 py-2 border-b border-outline/10 last:border-0", children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: `flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
        ${variant === "over" ? "text-rose-600 dark:text-rose-300" : "text-sky-600 dark:text-sky-300"}`,
        style: {
          backgroundColor: variant === "over" ? `rgba(244, 63, 94, ${Math.max(0.1, intensity * 0.3)})` : `rgba(14, 165, 233, ${Math.max(0.1, intensity * 0.3)})`
        },
        children: count
      }
    ),
    /* @__PURE__ */ jsx("p", { className: "text-sm text-on-surface-variant flex-1 leading-relaxed", children: bullet })
  ] });
}
function EvidenceDashboard() {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const { isAuthenticated } = useAuthStore();
  const [report, setReport] = useState(null);
  const [bullets, setBullets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("report");
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
  }, [isAuthenticated]);
  async function fetchData() {
    var _a2, _b2;
    setLoading(true);
    setError(null);
    try {
      const [reportRes, bulletsRes] = await Promise.all([
        api.get("/evidence/report"),
        api.get("/evidence/bullets")
      ]);
      setReport(reportRes.data);
      setBullets(bulletsRes.data.bullets || []);
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.error) || "Failed to load evidence data");
    } finally {
      setLoading(false);
    }
  }
  if (!isAuthenticated) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "glass-card p-12 flex items-center gap-3 text-on-surface-variant rounded-3xl", children: [
      /* @__PURE__ */ jsx(RefreshCw, { className: "w-5 h-5 animate-spin" }),
      /* @__PURE__ */ jsx("span", { children: "Analyzing bullet evidence..." })
    ] }) });
  }
  if (error) {
    return /* @__PURE__ */ jsx("div", { className: "w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "glass-card p-12 text-center rounded-3xl max-w-md", children: [
      /* @__PURE__ */ jsx(AlertTriangle, { className: "w-10 h-10 text-rose-500 mx-auto mb-3" }),
      /* @__PURE__ */ jsx("p", { className: "text-rose-600 font-medium mb-6", children: error }),
      /* @__PURE__ */ jsx("button", { onClick: fetchData, className: "px-6 py-2 glass-card hover:bg-white/40 text-on-surface rounded-xl text-sm transition-all font-bold", children: "Retry" })
    ] }) });
  }
  const maxOverCount = ((_a = report == null ? void 0 : report.overUsed) == null ? void 0 : _a.length) > 0 ? Math.max(...report.overUsed.map((b) => b.count)) : 1;
  return /* @__PURE__ */ jsx("div", { className: "w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 text-on-surface", children: /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
        /* @__PURE__ */ jsx(BarChart2, { className: "w-7 h-7 text-violet-400" }),
        /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black font-headline", children: "Evidence Audit" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium text-lg", children: "Track how your resume bullets are reused across applications." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4 mb-8", children: [
      /* @__PURE__ */ jsx(StatCard, { label: "Unique Bullets", value: (report == null ? void 0 : report.uniqueBullets) ?? 0, icon: CheckCircle, color: "text-emerald-400" }),
      /* @__PURE__ */ jsx(StatCard, { label: "Over-used", value: ((_b = report == null ? void 0 : report.overUsed) == null ? void 0 : _b.length) ?? 0, icon: AlertTriangle, color: "text-rose-400" }),
      /* @__PURE__ */ jsx(StatCard, { label: "Under-used", value: ((_c = report == null ? void 0 : report.underUsed) == null ? void 0 : _c.length) ?? 0, icon: TrendingDown, color: "text-amber-400" }),
      /* @__PURE__ */ jsx(StatCard, { label: "Total Bullets Tracked", value: bullets.length, icon: BarChart2, color: "text-sky-400" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid md:grid-cols-2 gap-6 mb-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 flex flex-col items-center gap-4", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-sm font-bold text-on-surface-variant uppercase tracking-wide self-start", children: "Diversity Score" }),
        /* @__PURE__ */ jsx(DiversityGauge, { score: (report == null ? void 0 : report.diversity) ?? 0 }),
        /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-on-surface-variant text-center", children: "Higher scores mean bullets are spread more evenly across applications." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4", children: "Suggestions" }),
        ((_d = report == null ? void 0 : report.suggestions) == null ? void 0 : _d.length) === 0 ? /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant text-sm font-medium", children: "No suggestions — your bullet usage looks healthy!" }) : /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: (_e = report == null ? void 0 : report.suggestions) == null ? void 0 : _e.map((s, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-3 text-sm text-on-surface font-medium leading-relaxed", children: [
          /* @__PURE__ */ jsx(Lightbulb, { className: "w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" }),
          s
        ] }, i)) })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex gap-2 mb-4", children: [
      { id: "report", label: "Reuse Report" },
      { id: "bullets", label: "All Bullets" }
    ].map((tab) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => setActiveTab(tab.id),
        className: `px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-sm
                ${activeTab === tab.id ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg" : "glass-card hover:bg-white/40 text-on-surface-variant hover:text-on-surface"}`,
        children: tab.label
      },
      tab.id
    )) }),
    activeTab === "report" && /* @__PURE__ */ jsxs("div", { className: "grid md:grid-cols-2 gap-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "w-4 h-4 text-rose-400" }),
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-rose-300", children: "Over-used Bullets (>2 uses)" })
        ] }),
        ((_f = report == null ? void 0 : report.overUsed) == null ? void 0 : _f.length) === 0 ? /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium text-sm", children: "None — no bullets are over-used." }) : report.overUsed.map((item, i) => /* @__PURE__ */ jsx(
          BulletHeatmapRow,
          {
            bullet: item.bullet,
            count: item.count,
            maxCount: maxOverCount,
            variant: "over"
          },
          i
        ))
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsx(TrendingDown, { className: "w-4 h-4 text-sky-400" }),
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-sky-300", children: "Under-used Bullets (0–1 uses)" })
        ] }),
        ((_g = report == null ? void 0 : report.underUsed) == null ? void 0 : _g.length) === 0 ? /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium text-sm", children: "All bullets are being used." }) : report.underUsed.slice(0, 10).map((item, i) => /* @__PURE__ */ jsx(
          BulletHeatmapRow,
          {
            bullet: item.bullet,
            count: item.count,
            maxCount: 1,
            variant: "under"
          },
          i
        )),
        ((_h = report == null ? void 0 : report.underUsed) == null ? void 0 : _h.length) > 10 && /* @__PURE__ */ jsxs("p", { className: "text-xs text-on-surface-variant font-bold mt-4", children: [
          "+",
          report.underUsed.length - 10,
          " more under-used bullets"
        ] })
      ] })
    ] }),
    activeTab === "bullets" && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4", children: [
        "All Bullets (",
        bullets.length,
        ")"
      ] }),
      bullets.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-on-surface-variant font-medium text-sm", children: "No bullets tracked yet. Bullets are extracted when you tailor a resume or generate a cover letter." }) : /* @__PURE__ */ jsx("div", { className: "space-y-2", children: bullets.map((b) => {
        var _a2;
        return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4 py-4 border-b border-outline/10 last:border-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-on-surface leading-relaxed", children: b.bullet_text }),
            ((_a2 = b.skills) == null ? void 0 : _a2.length) > 0 && /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1 mt-1", children: b.skills.map((skill, i) => /* @__PURE__ */ jsx("span", { className: "text-xs glass-panel text-on-surface-variant px-3 py-1 rounded-full font-bold", children: skill }, i)) })
          ] }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-on-surface-variant font-bold flex-shrink-0 uppercase tracking-wider", children: b.source_section || "experience" })
        ] }, b.id);
      }) })
    ] })
  ] }) });
}
function StatCard({ label, value, icon: Icon, color }) {
  return /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow", children: [
    /* @__PURE__ */ jsx("div", { className: "w-12 h-12 rounded-2xl glass-card flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(Icon, { className: `w-6 h-6 ${color}` }) }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("p", { className: "text-2xl font-black text-on-surface", children: value }),
      /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-on-surface-variant uppercase tracking-wider", children: label })
    ] })
  ] });
}
function getScoreColor(score) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-blue-600 dark:text-blue-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
function getScoreBg(score) {
  if (score >= 80) return "border-emerald-200/50 dark:border-emerald-900/50";
  if (score >= 60) return "border-blue-200/50 dark:border-blue-900/50";
  if (score >= 40) return "border-amber-200/50 dark:border-amber-900/50";
  return "border-rose-200/50 dark:border-rose-900/50";
}
function JobFitAnalysis() {
  var _a, _b, _c, _d, _e, _f;
  const [resumes, setResumes] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [useManualResume, setUseManualResume] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const fetchResumes = async () => {
      try {
        const { data } = await api.get("/resume/list");
        if (data && data.success) {
          setResumes(data.data || []);
          if (data.data && data.data.length > 0) {
            setSelectedResumeId(data.data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch resumes:", err);
      }
    };
    fetchResumes();
  }, []);
  useEffect(() => {
    if (!selectedResumeId || useManualResume) return;
    const fetchResumeContent = async () => {
      try {
        const { data } = await api.get(`/resume/${selectedResumeId}`);
        if (data && data.success) {
          setResumeText(data.data.content || "");
        }
      } catch (err) {
        console.error("Failed to load resume text:", err);
        setError("Failed to load selected resume content. Try pasting manually.");
      }
    };
    fetchResumeContent();
  }, [selectedResumeId, useManualResume]);
  const handleAnalyze = async (e) => {
    var _a2, _b2;
    e.preventDefault();
    if (!resumeText.trim() || !jobDescription.trim()) {
      setError("Both resume text and job description are required");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const { data } = await api.post("/jobs/fit", {
        resumeText,
        jobDescription
      });
      if (data && data.success) {
        setReport(data);
      } else {
        throw new Error(data.error || "Failed to compute fit score");
      }
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.error) || err.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const radarData = report ? [
    { subject: "Domain Fit", value: ((_a = report.breakdown) == null ? void 0 : _a.domain) || 0, fullMark: 100 },
    { subject: "Seniority Fit", value: ((_b = report.breakdown) == null ? void 0 : _b.seniority) || 0, fullMark: 100 },
    { subject: "Skill Overlap", value: ((_c = report.breakdown) == null ? void 0 : _c.skills) || 0, fullMark: 100 }
  ] : [];
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-12", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-blue-500/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-blue-600 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "radar" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Job Fit Analyzer" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Analyze how well your resume matches a target job description across domain, seniority level, and core skills." })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-medium flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 flex-shrink-0" }),
      error
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleAnalyze, className: "grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface", children: "Your Resume" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setUseManualResume(!useManualResume);
                setResumeText("");
              },
              className: "text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold transition-colors",
              children: useManualResume ? "Use Saved Resume" : "Paste Text Manually"
            }
          )
        ] }),
        !useManualResume ? /* @__PURE__ */ jsx("div", { className: "mb-4", children: resumes.length > 0 ? /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(
            "select",
            {
              value: selectedResumeId,
              onChange: (e) => setSelectedResumeId(e.target.value),
              className: "w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none",
              children: resumes.map((r) => /* @__PURE__ */ jsxs("option", { value: r.id, children: [
                r.file_name,
                " (",
                new Date(r.created_at).toLocaleDateString(),
                ")"
              ] }, r.id))
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "mt-3", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-semibold text-slate-400 mb-1", children: "Extracted Resume Content (Read-Only)" }),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                readOnly: true,
                rows: 8,
                className: "w-full bg-slate-50 dark:bg-slate-900/55 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-xs text-slate-500 resize-none outline-none",
                value: resumeText,
                placeholder: "Loading resume content..."
              }
            )
          ] })
        ] }) : /* @__PURE__ */ jsxs("div", { className: "text-center py-8 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/10", children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-500 dark:text-slate-400 mb-2", children: "No saved resumes found." }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setUseManualResume(true),
              className: "text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg transition-colors",
              children: "Paste Text Manually"
            }
          )
        ] }) }) : /* @__PURE__ */ jsx(
          "textarea",
          {
            required: true,
            rows: 12,
            placeholder: "Paste your plain-text resume here...",
            className: "w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y flex-1",
            value: resumeText,
            onChange: (e) => setResumeText(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl flex flex-col justify-between", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col mb-4", children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Job Description" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              required: true,
              rows: 12,
              placeholder: "Paste the target job description here...",
              className: "w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y flex-1",
              value: jobDescription,
              onChange: (e) => setJobDescription(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: loading,
            className: "w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3.5 rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_20px_rgba(37,99,235,0.2)] flex items-center justify-center gap-3",
            children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
              "Calculating Fit..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "radar" }),
              "Calculate Job Fit"
            ] })
          }
        )
      ] })
    ] }),
    report && !loading && /* @__PURE__ */ jsxs("div", { className: "max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500", children: [
      /* @__PURE__ */ jsxs("div", { className: `glass-card rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8 ${getScoreBg(report.score)}`, children: [
        /* @__PURE__ */ jsxs("div", { className: "relative shrink-0", children: [
          /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 36 36", className: "w-36 h-36 -rotate-90", children: [
            /* @__PURE__ */ jsx("circle", { cx: "18", cy: "18", r: "15.9", fill: "none", stroke: "rgba(226, 232, 240, 0.5)", strokeWidth: "3" }),
            /* @__PURE__ */ jsx(
              "circle",
              {
                cx: "18",
                cy: "18",
                r: "15.9",
                fill: "none",
                stroke: report.score >= 80 ? "#10b981" : report.score >= 60 ? "#2563eb" : report.score >= 40 ? "#f59e0b" : "#ef4444",
                strokeWidth: "3",
                strokeDasharray: `${report.score} 100`,
                strokeLinecap: "round",
                className: "transition-all duration-1000 ease-out"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
            /* @__PURE__ */ jsx("span", { className: "text-4xl font-black text-slate-800 dark:text-slate-100", children: report.score }),
            /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider", children: "/ 100" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-center md:text-left flex-1 space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-center md:justify-start gap-2 items-center", children: [
            /* @__PURE__ */ jsx("span", { className: `px-4 py-1.5 rounded-full text-sm font-bold shadow-sm bg-white dark:bg-slate-800 ${getScoreColor(report.score)}`, children: report.score >= 80 ? "Excellent Match" : report.score >= 60 ? "Strong Match" : report.score >= 40 ? "Fair Match" : "Low Match" }),
            /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold", children: report.method === "llm" ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Sparkles, { className: "w-3.5 h-3.5 text-purple-500" }),
              "AI Calculated"
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(HelpCircle, { className: "w-3.5 h-3.5 text-purple-500" }),
              "Rule Fallback"
            ] }) })
          ] }),
          /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-800 dark:text-slate-100 font-headline", children: "Overall Job Fit Index" }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-400 font-medium", children: "The score is computed based on domain alignment (35%), seniority equivalence (35%), and tech skills overlap (30%)." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-12 gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card p-6 rounded-3xl md:col-span-5 flex flex-col items-center justify-center min-h-[300px]", children: [
          /* @__PURE__ */ jsx("h3", { className: "text-base font-bold text-on-surface mb-4 self-start font-headline", children: "Match Profile" }),
          /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: 240, children: /* @__PURE__ */ jsxs(RadarChart, { cx: "50%", cy: "50%", outerRadius: "75%", data: radarData, children: [
            /* @__PURE__ */ jsx(PolarGrid, { stroke: "#e2e8f0" }),
            /* @__PURE__ */ jsx(PolarAngleAxis, { dataKey: "subject", tick: { fill: "#64748b", fontSize: 11, fontWeight: 600 } }),
            /* @__PURE__ */ jsx(PolarRadiusAxis, { angle: 30, domain: [0, 100], tick: { fill: "#94a3b8" } }),
            /* @__PURE__ */ jsx(Radar, { name: "Job Fit", dataKey: "value", stroke: "#3b82f6", fill: "#3b82f6", fillOpacity: 0.4 }),
            /* @__PURE__ */ jsx(Tooltip, {})
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4 md:col-span-7", children: [
          /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl flex items-start gap-4", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-xl shrink-0", children: /* @__PURE__ */ jsx(Briefcase, { className: "w-5 h-5" }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
                /* @__PURE__ */ jsx("h4", { className: "font-bold text-on-surface", children: "Domain Fit" }),
                /* @__PURE__ */ jsxs("span", { className: "text-sm font-black text-blue-600 dark:text-blue-400", children: [
                  ((_d = report.breakdown) == null ? void 0 : _d.domain) || 0,
                  "%"
                ] })
              ] }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 dark:text-slate-400", children: "Measures industry compatibility using ONET occupational codes. If matching, you possess crucial industry-specific contextual knowledge." })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl flex items-start gap-4", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0", children: /* @__PURE__ */ jsx(Award, { className: "w-5 h-5" }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
                /* @__PURE__ */ jsx("h4", { className: "font-bold text-on-surface", children: "Seniority Equivalence" }),
                /* @__PURE__ */ jsxs("span", { className: "text-sm font-black text-emerald-600 dark:text-emerald-400", children: [
                  ((_e = report.breakdown) == null ? void 0 : _e.seniority) || 0,
                  "%"
                ] })
              ] }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 dark:text-slate-400", children: "Assesses years-of-experience matches or explicit title seniority levels. Avoids under-qualification (skill gaps) or over-qualification." })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "glass-card p-5 rounded-2xl flex items-start gap-4", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl shrink-0", children: /* @__PURE__ */ jsx(Code, { className: "w-5 h-5" }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
                /* @__PURE__ */ jsx("h4", { className: "font-bold text-on-surface", children: "Skill Overlap" }),
                /* @__PURE__ */ jsxs("span", { className: "text-sm font-black text-amber-600 dark:text-amber-400", children: [
                  ((_f = report.breakdown) == null ? void 0 : _f.skills) || 0,
                  "%"
                ] })
              ] }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 dark:text-slate-400", children: "Jaccard index calculation on technical skill keyword intersections. Indicates coverage of the technical tooling specified in the posting." })
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
}
const QUESTIONS = [
  {
    id: "goal",
    question: "What is your primary goal right now?",
    type: "single",
    options: [
      { value: "land-faang", label: "🚀 Land at a top company", desc: "FAANG, unicorn, or high-growth startup" },
      { value: "first-job", label: "🌱 Get my first tech job", desc: "Breaking into the industry from scratch" },
      { value: "level-up", label: "📈 Level up my career", desc: "Grow from where I am right now" },
      { value: "switch", label: "🔄 Switch into tech", desc: "Transitioning from a different field" }
    ]
  },
  {
    id: "experience",
    question: "How much professional experience do you have?",
    type: "single",
    options: [
      { value: "beginner", label: "🌱 Beginner", desc: "0–1 year or no professional experience" },
      { value: "intermediate", label: "📈 Intermediate", desc: "1–3 years in the industry" },
      { value: "advanced", label: "⭐ Advanced", desc: "3+ years, looking to make a big leap" }
    ]
  },
  {
    id: "challenges",
    question: "What are your biggest challenges? (Pick all that apply)",
    type: "multiple",
    options: [
      { value: "resume", label: "📄 Resume & Portfolio", desc: "Getting past ATS and standing out" },
      { value: "interviews", label: "🎤 Interview Skills", desc: "Technical & behavioral interviews" },
      { value: "skills", label: "🛠️ Skill Gaps", desc: "Missing key technical knowledge" },
      { value: "projects", label: "⚙️ Project Building", desc: "Need portfolio-worthy project ideas" },
      { value: "search", label: "🔍 Job Search Strategy", desc: "Finding the right opportunities" }
    ]
  }
];
const TRACK_RECOMMENDATIONS = {
  beginner: "zero-to-hero",
  intermediate: "learn-and-build",
  advanced: "tune-and-polish"
};
const TRACKS$1 = {
  "zero-to-hero": {
    id: "zero-to-hero",
    title: "Zero to Hero",
    subtitle: "Your complete beginner-to-hired roadmap",
    description: "Start from scratch with an AI-generated roadmap tailored to your target role. Your personal AI Tutor explains every concept along the way.",
    icon: Rocket,
    color: "from-emerald-400 to-teal-600",
    features: ["AI-generated learning roadmap", "Personal AI Tutor", "Step-by-step skill tracking"],
    path: "/preparation/zero-to-hero"
  },
  "learn-and-build": {
    id: "learn-and-build",
    title: "Learn & Build",
    subtitle: "Fill gaps. Build projects. Get hired.",
    description: "Generate hyper-targeted portfolio projects based on your current skills and target role. Track every project on a visual Kanban board.",
    icon: Wrench,
    color: "from-orange-400 to-rose-500",
    features: ["AI project suggestions", "Blueprint generator", "Portfolio Kanban tracker"],
    path: "/preparation/learn-and-build"
  },
  "tune-and-polish": {
    id: "tune-and-polish",
    title: "Tune & Polish",
    subtitle: "Sharpen everything before the big leap",
    description: "Generate perfect STAR interview stories, run your resume through ATS, and practice targeted mock interviews.",
    icon: Target,
    color: "from-blue-500 to-indigo-600",
    features: ["STAR story generator", "ATS resume analysis", "Mock interview prep"],
    path: "/preparation/tune-and-polish"
  }
};
const STEPS = { QUESTIONS: "questions", REVEAL: "reveal" };
function PreparationOnboarding({ onComplete }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.QUESTIONS);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({ goal: null, experience: null, challenges: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [recommended, setRecommended] = useState(null);
  const currentQ = QUESTIONS[qIndex];
  const isLast = qIndex === QUESTIONS.length - 1;
  const handleAnswer = (value) => {
    if (currentQ.type === "single") {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: value }));
      if (!isLast) setTimeout(() => setQIndex((i) => i + 1), 280);
    } else {
      setAnswers((prev) => ({
        ...prev,
        challenges: prev.challenges.includes(value) ? prev.challenges.filter((v) => v !== value) : [...prev.challenges, value]
      }));
    }
  };
  const handleSubmit = async () => {
    const track = TRACK_RECOMMENDATIONS[answers.experience] || "zero-to-hero";
    setRecommended(track);
    setIsSaving(true);
    try {
      await api.patch("/progress/preferences", {
        data: {
          prepOnboardingDone: true,
          recommendedTrack: track,
          prepAnswers: answers
        }
      });
    } catch {
    } finally {
      setIsSaving(false);
    }
    setStep(STEPS.REVEAL);
  };
  const handleStartTrack = async (trackId) => {
    window.dispatchEvent(new Event("prep-onboarding-complete"));
    onComplete({ recommendedTrack: trackId });
    navigate(TRACKS$1[trackId].path);
  };
  const handleGoToDashboard = () => {
    window.dispatchEvent(new Event("prep-onboarding-complete"));
    onComplete({ recommendedTrack: recommended });
    navigate("/preparation");
  };
  if (step === STEPS.QUESTIONS) {
    const isAnswered = currentQ.type === "single" ? !!answers[currentQ.id] : answers.challenges.length > 0;
    return /* @__PURE__ */ jsx("div", { className: "w-full min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center p-6", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-2xl", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center mb-10", children: [
        /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white mb-5 shadow-lg shadow-blue-200", children: /* @__PURE__ */ jsx(BrainCircuit, { className: "w-7 h-7" }) }),
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-slate-900 dark:text-white", children: "Let's find your path" }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500 dark:text-slate-400 mt-2", children: "3 quick questions to recommend the best preparation track for you" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex gap-2 mb-8 justify-center", children: QUESTIONS.map((_, i) => /* @__PURE__ */ jsx(
        "div",
        {
          className: `h-1.5 rounded-full transition-all duration-300 ${i < qIndex ? "w-8 bg-blue-500" : i === qIndex ? "w-12 bg-blue-600" : "w-8 bg-slate-200 dark:bg-slate-700"}`
        },
        i
      )) }),
      /* @__PURE__ */ jsxs("div", { className: "bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 p-8 mb-5", children: [
        /* @__PURE__ */ jsxs("p", { className: "text-xs font-bold uppercase tracking-widest text-blue-500 mb-3", children: [
          "Question ",
          qIndex + 1,
          " of ",
          QUESTIONS.length
        ] }),
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-slate-900 dark:text-white mb-6", children: currentQ.question }),
        /* @__PURE__ */ jsx("div", { className: "space-y-3", children: currentQ.options.map((opt) => {
          const selected = currentQ.type === "single" ? answers[currentQ.id] === opt.value : answers.challenges.includes(opt.value);
          return /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => handleAnswer(opt.value),
              className: `w-full text-left p-4 rounded-2xl border-2 transition-all duration-150 flex items-start gap-3 group ${selected ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-slate-100 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"}`,
              children: [
                /* @__PURE__ */ jsx("div", { className: `mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? "bg-blue-600 border-blue-600" : "border-slate-300 dark:border-slate-500"}`, children: selected && /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-white" }) }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("p", { className: `font-semibold text-sm ${selected ? "text-blue-700 dark:text-blue-300" : "text-slate-800 dark:text-slate-200"}`, children: opt.label }),
                  /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400 mt-0.5", children: opt.desc })
                ] })
              ]
            },
            opt.value
          );
        }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        qIndex > 0 && /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setQIndex((i) => i - 1),
            className: "px-5 py-3 rounded-xl font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors",
            children: "Back"
          }
        ),
        isLast ? /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleSubmit,
            disabled: !isAnswered || isSaving,
            className: "flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2",
            children: isSaving ? "Saving…" : /* @__PURE__ */ jsxs(Fragment, { children: [
              "Find My Track ",
              /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
            ] })
          }
        ) : /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setQIndex((i) => i + 1),
            disabled: !isAnswered,
            className: "flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2",
            children: [
              "Next ",
              /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
            ]
          }
        )
      ] })
    ] }) });
  }
  if (step === STEPS.REVEAL) {
    const rec = TRACKS$1[recommended];
    const RecIcon = rec.icon;
    const others = Object.values(TRACKS$1).filter((t) => t.id !== recommended);
    return /* @__PURE__ */ jsx("div", { className: "w-full min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 py-12 px-6 flex items-start justify-center", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-3xl", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center mb-10", children: [
        /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-bold px-4 py-1.5 rounded-full mb-5", children: [
          /* @__PURE__ */ jsx(Sparkles, { className: "w-4 h-4" }),
          " Your personalized track is ready"
        ] }),
        /* @__PURE__ */ jsxs("h1", { className: "text-4xl font-black text-slate-900 dark:text-white mb-3", children: [
          "We recommend ",
          /* @__PURE__ */ jsx("span", { className: "text-blue-600", children: rec.title })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500 dark:text-slate-400 max-w-xl mx-auto", children: "Based on your answers, this track is the perfect fit for where you are right now." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: `relative rounded-3xl p-8 bg-gradient-to-br ${rec.color} text-white shadow-2xl mb-5 overflow-hidden`, children: [
        /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 -mr-16 -mt-16 blur-2xl" }),
        /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between mb-5", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 bg-white/20 rounded-2xl", children: /* @__PURE__ */ jsx(RecIcon, { className: "w-8 h-8" }) }),
            /* @__PURE__ */ jsx("span", { className: "bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full", children: "⭐ Recommended" })
          ] }),
          /* @__PURE__ */ jsx("h2", { className: "text-3xl font-black mb-1", children: rec.title }),
          /* @__PURE__ */ jsx("p", { className: "text-white/80 text-sm font-medium mb-4", children: rec.subtitle }),
          /* @__PURE__ */ jsx("p", { className: "text-white/90 mb-6 leading-relaxed", children: rec.description }),
          /* @__PURE__ */ jsx("div", { className: "space-y-2 mb-8", children: rec.features.map((f) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm text-white/90", children: [
            /* @__PURE__ */ jsx(CheckCircle2, { className: "w-4 h-4 text-white flex-shrink-0" }),
            f
          ] }, f)) }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => handleStartTrack(rec.id),
              className: "flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-white/90 transition-all shadow-lg",
              children: [
                /* @__PURE__ */ jsx(Play, { className: "w-5 h-5" }),
                " Start ",
                rec.title
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-widest text-slate-400 mb-3", children: "Or choose a different track" }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6", children: others.map((track) => {
        const Icon = track.icon;
        return /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => handleStartTrack(track.id),
            className: "text-left bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all group",
            children: [
              /* @__PURE__ */ jsx("div", { className: `inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${track.color} text-white mb-3`, children: /* @__PURE__ */ jsx(Icon, { className: "w-5 h-5" }) }),
              /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 transition-colors", children: track.title }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400 mt-1", children: track.subtitle }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 text-xs text-blue-600 mt-3 font-semibold", children: [
                "Choose this track ",
                /* @__PURE__ */ jsx(ChevronRight, { className: "w-3 h-3" })
              ] })
            ]
          },
          track.id
        );
      }) }),
      /* @__PURE__ */ jsx("div", { className: "text-center", children: /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleGoToDashboard,
          className: "text-sm text-slate-400 hover:text-blue-600 transition-colors font-medium",
          children: "Go to Preparation Dashboard instead →"
        }
      ) })
    ] }) });
  }
  return null;
}
const TRACKS = [
  {
    id: "zero-to-hero",
    title: "Zero to Hero",
    subtitle: "For Complete Beginners",
    description: "Start from scratch with an AI-generated roadmap tailored to your role. Your personal AI Tutor explains every concept along the way.",
    icon: Rocket,
    color: "from-emerald-400 to-teal-600",
    bgAccent: "bg-emerald-50 dark:bg-emerald-900/10",
    path: "/preparation/zero-to-hero"
  },
  {
    id: "tune-and-polish",
    title: "Tune & Polish",
    subtitle: "For Experienced Professionals",
    description: "Generate STAR interview stories, run your resume through ATS, and sharpen everything before the big leap.",
    icon: Target,
    color: "from-blue-500 to-indigo-600",
    bgAccent: "bg-blue-50 dark:bg-blue-900/10",
    path: "/preparation/tune-and-polish"
  },
  {
    id: "learn-and-build",
    title: "Learn & Build",
    subtitle: "For Intermediate Builders",
    description: "Generate hyper-targeted portfolio projects to fill skill gaps and track everything on a visual Kanban board.",
    icon: Wrench,
    color: "from-orange-400 to-rose-500",
    bgAccent: "bg-orange-50 dark:bg-orange-900/10",
    path: "/preparation/learn-and-build"
  }
];
function JobPreparation() {
  const [status, setStatus] = useState("loading");
  const [recommendedTrack, setRecommendedTrack] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get("/progress/preferences").then(({ data }) => {
      if (cancelled) return;
      const prefs = (data == null ? void 0 : data.data) || {};
      if (prefs.prepOnboardingDone) {
        setRecommendedTrack(prefs.recommendedTrack || null);
        setStatus("hub");
      } else {
        setStatus("onboarding");
      }
    }).catch(() => {
      if (!cancelled) setStatus("onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const handleOnboardingComplete = ({ recommendedTrack: track }) => {
    setRecommendedTrack(track);
    setStatus("hub");
  };
  if (status === "loading") {
    return /* @__PURE__ */ jsx("div", { className: "w-full min-h-[60vh] flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-500 font-medium", children: "Loading your workspace…" })
    ] }) });
  }
  if (status === "onboarding") {
    return /* @__PURE__ */ jsx(PreparationOnboarding, { onComplete: handleOnboardingComplete });
  }
  return /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto px-4 py-10 space-y-12 w-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center space-y-4", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl mb-2", children: /* @__PURE__ */ jsx(BrainCircuit, { className: "w-8 h-8 text-indigo-600 dark:text-indigo-400" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 dark:text-white tracking-tight", children: "Preparation Dashboard" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed", children: "Your three AI-powered tracks are ready. Pick up where you left off or explore a new path." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-6", children: TRACKS.map((track) => {
      const Icon = track.icon;
      const isRecommended = track.id === recommendedTrack;
      return /* @__PURE__ */ jsxs(
        Link,
        {
          to: track.path,
          className: `group relative flex flex-col rounded-3xl p-8 hover:-translate-y-2 transition-all duration-300 hover:shadow-xl overflow-hidden border ${isRecommended ? "border-blue-300 dark:border-blue-700 shadow-lg shadow-blue-100 dark:shadow-blue-900/20" : "border-white/50 dark:border-slate-700/50 glass-card"} ${isRecommended ? track.bgAccent : ""}`,
          children: [
            isRecommended && /* @__PURE__ */ jsxs("div", { className: "absolute top-4 right-4 flex items-center gap-1 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full", children: [
              /* @__PURE__ */ jsx(Star, { className: "w-3 h-3" }),
              " Your Track"
            ] }),
            /* @__PURE__ */ jsx("div", { className: `absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-gradient-to-br ${track.color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity` }),
            /* @__PURE__ */ jsx("div", { className: `inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${track.color} text-white mb-6 shadow-lg`, children: /* @__PURE__ */ jsx(Icon, { className: "w-7 h-7" }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider", children: track.subtitle }),
              /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-900 dark:text-white mb-3", children: track.title }),
              /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-400 leading-relaxed mb-8", children: track.description })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mt-auto", children: [
              isRecommended ? "Continue Track" : "Start Track",
              /* @__PURE__ */ jsx(ChevronRight, { className: "w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" })
            ] })
          ]
        },
        track.id
      );
    }) }),
    /* @__PURE__ */ jsx("div", { className: "text-center", children: /* @__PURE__ */ jsx(
      "button",
      {
        onClick: async () => {
          try {
            await api.patch("/progress/preferences", { data: { prepOnboardingDone: false } });
          } catch {
          }
          window.dispatchEvent(new Event("prep-onboarding-reset"));
          setStatus("onboarding");
          setRecommendedTrack(null);
        },
        className: "text-sm text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium",
        children: "Not sure which track? Retake the questionnaire →"
      }
    ) })
  ] });
}
function STARGenerator() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [stories, setStories] = useState([]);
  const [error, setError] = useState("");
  const handleGenerate = async (e) => {
    var _a, _b;
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/job-prep/star-stories", { topic });
      setStories(res.data.data.stories);
    } catch (err) {
      setError(((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Failed to generate STAR stories.");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 border border-white/50 relative overflow-hidden", children: [
    /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 mb-6", children: [
      /* @__PURE__ */ jsx("div", { className: "p-3 bg-indigo-100 text-indigo-600 rounded-2xl", children: /* @__PURE__ */ jsx(Sparkles, { className: "w-6 h-6" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-900", children: "Interview Copilot" }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500", children: "Generate perfect STAR behavioral stories for your next interview" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleGenerate, className: "flex gap-3 mb-8", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: topic,
          onChange: (e) => setTopic(e.target.value),
          placeholder: "e.g. A time I faced a conflict, or Leadership experience",
          className: "flex-1 bg-surface-container border border-outline/20 rounded-xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "submit",
          disabled: loading || !topic.trim(),
          className: "flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold rounded-xl hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_10px_20px_rgba(79,70,229,0.2)] transition-all",
          children: [
            loading ? /* @__PURE__ */ jsx(Loader2, { className: "w-5 h-5 animate-spin" }) : /* @__PURE__ */ jsx(Send, { className: "w-5 h-5" }),
            "Generate"
          ]
        }
      )
    ] }),
    error && /* @__PURE__ */ jsx("div", { className: "p-4 bg-red-50 text-red-700 rounded-xl mb-6 text-sm", children: error }),
    stories.length > 0 ? /* @__PURE__ */ jsx("div", { className: "space-y-6 relative z-10", children: stories.map((story, i) => /* @__PURE__ */ jsxs("div", { className: "bg-white/60 backdrop-blur-md border border-slate-200/60 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow", children: [
      /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900 mb-4", children: story.title }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-4 text-sm", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "font-bold text-indigo-700", children: "Situation:" }),
          " ",
          /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: story.situation })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "font-bold text-indigo-700", children: "Task:" }),
          " ",
          /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: story.task })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "font-bold text-indigo-700", children: "Action:" }),
          " ",
          /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: story.action })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "font-bold text-indigo-700", children: "Result:" }),
          " ",
          /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: story.result })
        ] })
      ] })
    ] }, i)) }) : /* @__PURE__ */ jsxs("div", { className: "text-center py-12 px-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-300", children: [
      /* @__PURE__ */ jsx(Sparkles, { className: "w-8 h-8 text-slate-300 mx-auto mb-3" }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-500 font-medium", children: "Enter a topic above to generate professional STAR stories." })
    ] })
  ] });
}
function TuneAndPolishTrack() {
  return /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto px-4 py-8 space-y-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 mb-10", children: [
      /* @__PURE__ */ jsx("div", { className: "p-4 bg-blue-100 text-blue-600 rounded-2xl", children: /* @__PURE__ */ jsx(Target, { className: "w-8 h-8" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-slate-900", children: "Tune & Polish" }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-1 text-lg", children: "Fine-tune your application and crush your interviews." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-1 space-y-6", children: [
        /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 text-lg flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Zap, { className: "w-5 h-5 text-amber-500" }),
          "Quick Actions"
        ] }),
        /* @__PURE__ */ jsxs(Link, { to: "/ats-checker", className: "block glass-card p-6 rounded-2xl hover:-translate-y-1 transition-all border border-white/50 group", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 bg-teal-50 text-teal-600 rounded-xl", children: /* @__PURE__ */ jsx(FileCode2, { className: "w-6 h-6" }) }),
            /* @__PURE__ */ jsx(ChevronRight, { className: "w-5 h-5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-1 transition-all" })
          ] }),
          /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 mb-1", children: "ATS Scanner" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Scan your resume against a job description to find missing keywords." })
        ] }),
        /* @__PURE__ */ jsxs(Link, { to: "/resume", className: "block glass-card p-6 rounded-2xl hover:-translate-y-1 transition-all border border-white/50 group", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 bg-blue-50 text-blue-600 rounded-xl", children: /* @__PURE__ */ jsx(FileText, { className: "w-6 h-6" }) }),
            /* @__PURE__ */ jsx(ChevronRight, { className: "w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" })
          ] }),
          /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 mb-1", children: "Resume Optimizer" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Rewrite your bullet points to sound more impactful and results-driven." })
        ] }),
        /* @__PURE__ */ jsxs(Link, { to: "/interview", className: "block glass-card p-6 rounded-2xl hover:-translate-y-1 transition-all border border-white/50 group", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsx("div", { className: "p-3 bg-purple-50 text-purple-600 rounded-xl", children: /* @__PURE__ */ jsx(Mic, { className: "w-6 h-6" }) }),
            /* @__PURE__ */ jsx(ChevronRight, { className: "w-5 h-5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" })
          ] }),
          /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 mb-1", children: "Mock Interviews" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Practice live technical and behavioral questions with an AI interviewer." })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsx(STARGenerator, {}) })
    ] })
  ] });
}
function useUserProgress(contextKey, defaultData = {}) {
  const { isAuthenticated } = useAuthStore();
  const [data, setData] = useState(defaultData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const saveTimer = useRef(null);
  const pendingRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      setIsReady(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setIsReady(false);
    setError(null);
    api.get(`/progress/${contextKey}`).then(({ data: res }) => {
      if (cancelled) return;
      const stored = (res == null ? void 0 : res.data) && Object.keys(res.data).length > 0 ? res.data : defaultData;
      setData(stored);
      setIsReady(true);
    }).catch((err) => {
      if (cancelled) return;
      console.error(`Failed to load progress (${contextKey}):`, err);
      setData(defaultData);
      setIsReady(true);
      setError("Could not load your saved progress.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contextKey, isAuthenticated]);
  const flushSave = useCallback(async (payload) => {
    if (!isAuthenticated || !isReady) return;
    setIsSaving(true);
    try {
      await api.put(`/progress/${contextKey}`, { data: payload });
      setError(null);
    } catch (err) {
      console.error(`Failed to save progress (${contextKey}):`, err);
      setError("Failed to save progress. Changes will retry on next edit.");
    } finally {
      setIsSaving(false);
    }
  }, [contextKey, isAuthenticated, isReady]);
  const scheduleSave = useCallback((payload) => {
    pendingRef.current = payload;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (pendingRef.current) {
        flushSave(pendingRef.current);
        pendingRef.current = null;
      }
    }, 700);
  }, [flushSave]);
  const updateProgress = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);
  const replaceProgress = useCallback((next) => {
    setData(next);
    scheduleSave(next);
  }, [scheduleSave]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  return {
    data,
    setData: replaceProgress,
    updateProgress,
    isLoading,
    isSaving,
    error,
    isReady: !isLoading && isReady
  };
}
const DEFAULT_TUTOR_MESSAGE = {
  role: "assistant",
  content: "Hi! I'm your AI Tutor. Ask me to explain any concept from your roadmap!"
};
const ZERO_TO_HERO_DEFAULTS = {
  step: "intro",
  collectedData: {},
  wizardCurrentQIndex: 0,
  wizardMessages: [],
  expandedPhases: {},
  messages: [DEFAULT_TUTOR_MESSAGE],
  targetRole: ""
};
const WIZARD_QUESTIONS = [
  {
    id: "role",
    text: "What specific IT area or role would you like to focus on?",
    type: "options",
    options: [
      "AI & ML",
      "Data Science",
      "Software Development",
      "Cloud & DevOps",
      "Cybersecurity",
      "Product Management",
      "UI/UX Design",
      "Business Analysis",
      "Internships",
      "Freshers Jobs",
      "Remote Jobs"
    ]
  },
  {
    id: "interests",
    text: "What best describes your interests within this area?",
    type: "options",
    options: ["Building Products", "Research & Analysis", "Problem Solving", "Design & Creativity", "Teaching & Mentoring", "Automation & Optimization"]
  },
  {
    id: "experience",
    text: "How much prior experience do you have in this field?",
    type: "options",
    options: ["None at all", "Less than 6 months", "6 months – 1 year", "1–2 years", "2+ years"]
  },
  { id: "projects", text: `Have you built any projects previously? Briefly describe them (or say "None" if you haven't).`, type: "text" },
  {
    id: "knowledge",
    text: "How would you honestly rate your current knowledge level?",
    type: "options",
    options: ["🌱 Complete Beginner", "📚 Intermediate", "🚀 Advanced / Professional"]
  },
  {
    id: "timePerDay",
    text: "How much time can you realistically dedicate to preparation each day?",
    type: "options",
    options: ["Less than 1 hour", "1–2 hours", "3–4 hours", "5+ hours"]
  },
  {
    id: "monthsToPrepare",
    text: "How many months do you have to prepare before you want to be interview-ready?",
    type: "options",
    options: ["1 month", "2–3 months", "4–6 months", "6–12 months", "More than a year"]
  }
];
function ZeroToHeroTrack() {
  var _a, _b;
  const { data: progress, updateProgress, isLoading: progressLoading, isSaving } = useUserProgress(
    "zero-to-hero",
    ZERO_TO_HERO_DEFAULTS
  );
  const step = progress.step;
  const collectedData = progress.collectedData;
  const wizardCurrentQIndex = progress.wizardCurrentQIndex;
  const wizardMessages = progress.wizardMessages;
  const expandedPhases = progress.expandedPhases;
  const messages = progress.messages;
  const targetRole = progress.targetRole;
  const [roadmap, setRoadmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [wizardInput, setWizardInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const chatEndRef = useRef(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  useEffect(() => {
    loadSavedRoadmap();
  }, []);
  useEffect(() => {
    if (step === "chat-wizard" && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [wizardMessages, isBotTyping, step]);
  if (progressLoading) {
    return /* @__PURE__ */ jsx("div", { className: "max-w-7xl mx-auto px-4 py-24 flex justify-center", children: /* @__PURE__ */ jsx(Loader2, { className: "w-8 h-8 animate-spin text-emerald-600" }) });
  }
  async function loadSavedRoadmap() {
    try {
      const { data } = await api.get("/career/roadmap");
      if (data && (data.roadmap || data.phases)) {
        setRoadmap(data.roadmap || data);
      }
    } catch (err) {
    }
  }
  const startWizard = () => {
    updateProgress({
      step: "chat-wizard",
      wizardCurrentQIndex: 0,
      collectedData: {},
      wizardMessages: [],
      targetRole: ""
    });
    setIsBotTyping(true);
    setTimeout(() => {
      setIsBotTyping(false);
      updateProgress((p) => ({
        ...p,
        wizardMessages: [{ role: "bot", text: "Welcome to your personal career prep journey! Let's build a roadmap tailored just for you." }]
      }));
      setIsBotTyping(true);
      setTimeout(() => {
        setIsBotTyping(false);
        updateProgress((p) => ({
          ...p,
          wizardMessages: [...p.wizardMessages, { role: "bot", text: WIZARD_QUESTIONS[0].text }]
        }));
      }, 1e3);
    }, 1500);
  };
  const handleWizardSubmit = (e, val = null) => {
    if (e) e.preventDefault();
    const answer = val !== null ? val : wizardInput;
    if (!answer.trim()) return;
    updateProgress((p) => ({
      ...p,
      wizardMessages: [...p.wizardMessages, { role: "user", text: answer }]
    }));
    setWizardInput("");
    const currentQ = WIZARD_QUESTIONS[wizardCurrentQIndex];
    const newData = { ...collectedData, [currentQ.id]: answer };
    const roleUpdate = currentQ.id === "role" ? { targetRole: answer } : {};
    const nextIndex = wizardCurrentQIndex + 1;
    if (nextIndex < WIZARD_QUESTIONS.length) {
      updateProgress((p) => ({
        ...p,
        collectedData: newData,
        wizardCurrentQIndex: nextIndex,
        ...roleUpdate
      }));
      setIsBotTyping(true);
      setTimeout(() => {
        setIsBotTyping(false);
        updateProgress((p) => ({
          ...p,
          wizardMessages: [...p.wizardMessages, { role: "bot", text: WIZARD_QUESTIONS[nextIndex].text }]
        }));
      }, 1e3);
    } else {
      updateProgress((p) => ({
        ...p,
        collectedData: newData,
        ...roleUpdate
      }));
      setIsBotTyping(true);
      setTimeout(() => {
        setIsBotTyping(false);
        updateProgress((p) => ({
          ...p,
          wizardMessages: [...p.wizardMessages, { role: "bot", text: "Perfect! I have all the details I need. Generating your custom roadmap..." }]
        }));
        setTimeout(() => {
          generateRoadmap(newData);
        }, 1500);
      }, 1e3);
    }
  };
  const generateRoadmap = async (data) => {
    setLoading(true);
    updateProgress({ step: "generating" });
    try {
      const res = await api.post("/career/roadmap", {
        currentRole: data.knowledge || "Beginner",
        targetRole: data.role || "IT Professional",
        currentSkills: [],
        timeframe: data.monthsToPrepare ? `${data.monthsToPrepare} months` : "6 months"
      });
      setRoadmap(res.data);
      updateProgress({ step: "display", expandedPhases: {} });
    } catch (err) {
      console.error(err);
      updateProgress({ step: "intro" });
    } finally {
      setLoading(false);
    }
  };
  const handleSendTutorMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = { role: "user", content: chatInput };
    const historyWithUser = [...messages, userMsg];
    updateProgress({ messages: historyWithUser });
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await api.post("/job-prep/tutor", {
        message: userMsg.content,
        history: messages
      });
      updateProgress({
        messages: [...historyWithUser, { role: "assistant", content: res.data.data.reply }]
      });
    } catch (err) {
      updateProgress({
        messages: [...historyWithUser, { role: "assistant", content: "Sorry, I couldn't process that right now." }]
      });
    } finally {
      setChatLoading(false);
    }
  };
  const togglePhase = (idx) => {
    updateProgress({
      expandedPhases: { ...expandedPhases, [idx]: !expandedPhases[idx] }
    });
  };
  return /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto px-4 py-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 mb-8", children: [
      /* @__PURE__ */ jsx("div", { className: "p-4 bg-emerald-100 text-emerald-600 rounded-2xl shadow-inner shadow-emerald-200/50", children: /* @__PURE__ */ jsx(Rocket, { className: "w-8 h-8" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-slate-900 tracking-tight", children: "Zero to Hero Track" }),
        /* @__PURE__ */ jsxs("p", { className: "text-slate-500 mt-1 text-lg", children: [
          "Your complete guided journey from beginner to hired.",
          isSaving && /* @__PURE__ */ jsx("span", { className: "ml-2 text-emerald-600 text-sm", children: "Saving…" })
        ] })
      ] })
    ] }),
    step === "intro" && /* @__PURE__ */ jsx("div", { className: "max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700", children: /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-10 border border-white/50 relative overflow-hidden group bg-white shadow-xl shadow-slate-200/50", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-700" }),
      /* @__PURE__ */ jsxs("div", { className: "relative z-10 flex flex-col md:flex-row gap-10 items-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full font-bold text-sm tracking-wide", children: [
            /* @__PURE__ */ jsx(Info, { className: "w-4 h-4 mr-2" }),
            "Currently Optimized for IT Sector"
          ] }),
          /* @__PURE__ */ jsxs("h2", { className: "text-4xl font-black text-slate-900 leading-tight", children: [
            "Start Building Your Career ",
            /* @__PURE__ */ jsx("span", { className: "text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600", children: "From Scratch" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-600 text-lg leading-relaxed", children: "The Zero to Hero page is designed to guide you step-by-step. We will help you identify your interests, build a hyper-targeted project roadmap, and provide you with an interactive AI tutor to answer all your technical questions along the way." }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4", children: [
              /* @__PURE__ */ jsx("div", { className: "p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-1", children: /* @__PURE__ */ jsx(Briefcase, { className: "w-5 h-5" }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900", children: "Create Impactful Projects" }),
                /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-sm", children: "Build real-world applications that recruiters actually want to see." })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4", children: [
              /* @__PURE__ */ jsx("div", { className: "p-2 bg-blue-100 text-blue-600 rounded-xl mt-1", children: /* @__PURE__ */ jsx(GraduationCap, { className: "w-5 h-5" }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900", children: "Explore Components" }),
                /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-sm", children: "Learn the 'why' and 'how' of modern tech stacks with our integrated AI tutor." })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-4 mt-6", children: [
            roadmap && /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => updateProgress({ step: "display" }),
                className: "flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-emerald-900/20",
                children: [
                  /* @__PURE__ */ jsx(Play, { className: "w-5 h-5 fill-current" }),
                  "Continue Saved Journey"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: startWizard,
                className: `flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all ${roadmap ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200" : "bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-900/20"}`,
                children: [
                  !roadmap && /* @__PURE__ */ jsx(Play, { className: "w-5 h-5 fill-current" }),
                  roadmap ? "Start A New Path" : "Start My Journey"
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 w-full flex justify-center", children: /* @__PURE__ */ jsxs("div", { className: "relative w-full max-w-sm aspect-square bg-gradient-to-br from-slate-50 to-slate-100 rounded-full border-8 border-white shadow-2xl flex items-center justify-center", children: [
          /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-emerald-500/10 rounded-full animate-pulse" }),
          /* @__PURE__ */ jsx(Rocket, { className: "w-32 h-32 text-emerald-500 drop-shadow-2xl" })
        ] }) })
      ] })
    ] }) }),
    step === "chat-wizard" && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto h-[600px] flex flex-col bg-slate-50 rounded-3xl shadow-2xl shadow-indigo-100 border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-500", children: [
      /* @__PURE__ */ jsxs("div", { className: "px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx("div", { className: "w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg", children: /* @__PURE__ */ jsx(Bot, { className: "w-6 h-6 text-white" }) }),
          /* @__PURE__ */ jsx("div", { className: "absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-slate-900", children: "Career Architect AI" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Online • Helping you build your path" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-6", children: [
        wizardMessages.map((msg, i) => /* @__PURE__ */ jsx("div", { className: `flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-4 fade-in duration-300`, children: /* @__PURE__ */ jsxs("div", { className: "flex items-end gap-2 max-w-[80%]", children: [
          msg.role === "bot" && /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mb-1", children: /* @__PURE__ */ jsx(Bot, { className: "w-4 h-4 text-emerald-600" }) }),
          /* @__PURE__ */ jsx("div", { className: `px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm ${msg.role === "user" ? "bg-slate-900 text-white rounded-br-sm" : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"}`, children: msg.text }),
          msg.role === "user" && /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mb-1", children: /* @__PURE__ */ jsx(User, { className: "w-4 h-4 text-slate-600" }) })
        ] }) }, i)),
        isBotTyping && /* @__PURE__ */ jsx("div", { className: "flex justify-start animate-in fade-in duration-300", children: /* @__PURE__ */ jsxs("div", { className: "flex items-end gap-2 max-w-[80%]", children: [
          /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mb-1", children: /* @__PURE__ */ jsx(Bot, { className: "w-4 h-4 text-emerald-600" }) }),
          /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 bg-white border border-slate-200 rounded-2xl rounded-bl-sm shadow-sm flex gap-1", children: [
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-slate-300 animate-bounce", style: { animationDelay: "0ms" } }),
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-slate-300 animate-bounce", style: { animationDelay: "150ms" } }),
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-slate-300 animate-bounce", style: { animationDelay: "300ms" } })
          ] })
        ] }) }),
        /* @__PURE__ */ jsx("div", { ref: chatEndRef })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "bg-white border-t border-slate-200 p-4", children: !isBotTyping && ((_a = WIZARD_QUESTIONS[wizardCurrentQIndex]) == null ? void 0 : _a.type) === "options" ? /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 justify-center", children: WIZARD_QUESTIONS[wizardCurrentQIndex].options.map((opt, i) => /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => handleWizardSubmit(null, opt),
          className: "px-6 py-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200 hover:bg-emerald-500 hover:text-white transition-colors",
          children: opt
        },
        i
      )) }) : /* @__PURE__ */ jsxs("form", { onSubmit: handleWizardSubmit, className: "relative flex items-center", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: wizardInput,
            onChange: (e) => setWizardInput(e.target.value),
            disabled: isBotTyping || wizardCurrentQIndex >= WIZARD_QUESTIONS.length,
            placeholder: isBotTyping ? "AI is typing..." : "Type your answer...",
            className: "w-full bg-slate-50 border border-slate-200 rounded-2xl pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 text-[15px]"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: isBotTyping || !wizardInput.trim() || wizardCurrentQIndex >= WIZARD_QUESTIONS.length,
            className: "absolute right-2 p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition-colors",
            children: /* @__PURE__ */ jsx(Send, { className: "w-5 h-5" })
          }
        )
      ] }) })
    ] }),
    step === "generating" && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-12 text-center max-w-xl mx-auto border border-white/50 mt-10 animate-in fade-in zoom-in-95 duration-500", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative w-20 h-20 mx-auto mb-8", children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 border-4 border-emerald-100 rounded-full" }),
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin" }),
        /* @__PURE__ */ jsx(Bot, { className: "w-8 h-8 text-emerald-600 absolute inset-0 m-auto" })
      ] }),
      /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-900 mb-2", children: "Architecting Your Blueprint" }),
      /* @__PURE__ */ jsxs("p", { className: "text-slate-600", children: [
        "Analyzing your ",
        targetRole,
        " goals and constructing a hyper-targeted 6-month plan..."
      ] })
    ] }),
    step === "display" && roadmap && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700", children: [
      /* @__PURE__ */ jsx("div", { className: "lg:col-span-2 space-y-6", children: /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 border border-white/50", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-3xl font-bold text-slate-900 mb-2", children: roadmap.title }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-600 mb-6", children: roadmap.summary }),
        /* @__PURE__ */ jsx("div", { className: "space-y-4", children: (_b = roadmap.phases) == null ? void 0 : _b.map((phase, idx) => /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => togglePhase(idx),
              className: "w-full px-6 py-4 flex items-center justify-between hover:bg-slate-100 transition-colors",
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 text-left", children: [
                  /* @__PURE__ */ jsx("div", { className: "w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 font-bold flex items-center justify-center shrink-0", children: idx + 1 }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: phase.title }),
                    /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: phase.duration })
                  ] })
                ] }),
                expandedPhases[idx] ? /* @__PURE__ */ jsx(ChevronUp, { className: "w-5 h-5 text-slate-400" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "w-5 h-5 text-slate-400" })
              ]
            }
          ),
          expandedPhases[idx] && /* @__PURE__ */ jsxs("div", { className: "px-6 py-4 border-t border-slate-200 bg-white", children: [
            /* @__PURE__ */ jsx("p", { className: "text-slate-700 mb-4", children: phase.description }),
            phase.skills && /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
              /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 text-sm mb-2 uppercase tracking-wider", children: "Skills" }),
              /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: phase.skills.map((s, i) => /* @__PURE__ */ jsx("span", { className: "px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold", children: s }, i)) })
            ] }),
            phase.goals && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 text-sm mb-2 uppercase tracking-wider", children: "Milestones" }),
              /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: phase.goals.map((g, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2 text-sm text-slate-700", children: [
                /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4 text-emerald-500 shrink-0 mt-0.5" }),
                g
              ] }, i)) })
            ] })
          ] })
        ] }, idx)) })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "lg:col-span-1", children: /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl border border-white/50 flex flex-col h-[600px] sticky top-24", children: [
        /* @__PURE__ */ jsxs("div", { className: "p-4 border-b border-slate-200 bg-emerald-50/50 rounded-t-3xl flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "p-2 bg-emerald-200 text-emerald-700 rounded-xl", children: /* @__PURE__ */ jsx(Bot, { className: "w-5 h-5" }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: "AI Tutor" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Ask any technical questions" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [
          messages.map((msg, i) => /* @__PURE__ */ jsx("div", { className: `flex ${msg.role === "user" ? "justify-end" : "justify-start"}`, children: /* @__PURE__ */ jsx("div", { className: `max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === "user" ? "bg-indigo-600 text-white rounded-br-none" : "bg-slate-100 text-slate-800 rounded-bl-none"}`, children: msg.content }) }, i)),
          chatLoading && /* @__PURE__ */ jsx("div", { className: "flex justify-start", children: /* @__PURE__ */ jsx("div", { className: "bg-slate-100 rounded-2xl rounded-bl-none p-3", children: /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin text-slate-500" }) }) })
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSendTutorMessage, className: "p-3 border-t border-slate-200 bg-white rounded-b-3xl flex gap-2", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: chatInput,
              onChange: (e) => setChatInput(e.target.value),
              placeholder: "Ask a question...",
              className: "flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: chatLoading || !chatInput.trim(),
              className: "p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50",
              children: /* @__PURE__ */ jsx(Send, { className: "w-4 h-4" })
            }
          )
        ] })
      ] }) })
    ] })
  ] });
}
const LEARN_BUILD_DEFAULTS = {
  targetRole: "",
  currentSkills: "",
  projectIdeas: [],
  tasks: [
    { id: "t1", title: "Personal Portfolio", status: "done" },
    { id: "t2", title: "React Weather App", status: "in-progress" }
  ]
};
function LearnAndBuildTrack() {
  var _a, _b, _c, _d, _e, _f;
  const { data: progress, updateProgress, isLoading: progressLoading, isSaving } = useUserProgress(
    "learn-and-build",
    LEARN_BUILD_DEFAULTS
  );
  const targetRole = progress.targetRole;
  const currentSkills = progress.currentSkills;
  const projectIdeas = progress.projectIdeas;
  const tasks = progress.tasks;
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [activeBlueprint, setActiveBlueprint] = useState(null);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);
  if (progressLoading) {
    return /* @__PURE__ */ jsx("div", { className: "max-w-7xl mx-auto px-4 py-24 flex justify-center", children: /* @__PURE__ */ jsx(Loader2, { className: "w-8 h-8 animate-spin text-orange-600" }) });
  }
  const handleGenerateProjects = async (e) => {
    e.preventDefault();
    if (!targetRole.trim()) return;
    setLoadingProjects(true);
    try {
      const res = await api.post("/job-prep/projects", { role: targetRole, skills: currentSkills });
      updateProgress({ projectIdeas: res.data.data.projects });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  };
  const handleGenerateBlueprint = async (project) => {
    setLoadingBlueprint(true);
    setActiveBlueprint({ title: project.title, loading: true });
    try {
      const res = await api.post("/job-prep/project-blueprint", { projectTitle: project.title });
      setActiveBlueprint({
        title: project.title,
        loading: false,
        blueprint: res.data.data.blueprint
      });
      if (!tasks.find((t) => t.title === project.title)) {
        updateProgress({
          tasks: [...tasks, { id: Date.now().toString(), title: project.title, status: "todo" }]
        });
      }
    } catch (err) {
      setActiveBlueprint(null);
    } finally {
      setLoadingBlueprint(false);
    }
  };
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData("taskId", id);
  };
  const handleDrop = (e, status) => {
    const id = e.dataTransfer.getData("taskId");
    updateProgress({
      tasks: tasks.map((t) => t.id === id ? { ...t, status } : t)
    });
  };
  const handleDragOver = (e) => {
    e.preventDefault();
  };
  return /* @__PURE__ */ jsxs("div", { className: "max-w-7xl mx-auto px-4 py-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 mb-8", children: [
      /* @__PURE__ */ jsx("div", { className: "p-4 bg-orange-100 text-orange-600 rounded-2xl", children: /* @__PURE__ */ jsx(Wrench, { className: "w-8 h-8" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-3xl font-black text-slate-900", children: [
          "Learn & Build Track",
          isSaving && /* @__PURE__ */ jsx("span", { className: "ml-2 text-orange-600 text-sm font-semibold", children: "Saving…" })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-1 text-lg", children: "Build hyper-targeted projects to fill your resume skill gaps." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-1 space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6 border border-white/50", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
            /* @__PURE__ */ jsx("div", { className: "p-2 bg-orange-50 text-orange-600 rounded-xl", children: /* @__PURE__ */ jsx(Code2, { className: "w-5 h-5" }) }),
            /* @__PURE__ */ jsx("h2", { className: "font-bold text-lg text-slate-900", children: "Project Architect" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mb-6", children: "Tell us your target role and current skills, and we'll suggest 3 perfect portfolio projects." }),
          /* @__PURE__ */ jsxs("form", { onSubmit: handleGenerateProjects, className: "space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2", children: "Target Role" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: targetRole,
                  onChange: (e) => updateProgress({ targetRole: e.target.value }),
                  placeholder: "e.g. React Developer",
                  className: "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2", children: "Current Skills (Optional)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: currentSkills,
                  onChange: (e) => updateProgress({ currentSkills: e.target.value }),
                  placeholder: "e.g. HTML, CSS, JS",
                  className: "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "submit",
                disabled: loadingProjects || !targetRole,
                className: "w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 disabled:opacity-50",
                children: [
                  loadingProjects ? /* @__PURE__ */ jsx(Loader2, { className: "w-5 h-5 animate-spin" }) : /* @__PURE__ */ jsx(Plus, { className: "w-5 h-5" }),
                  "Generate Ideas"
                ]
              }
            )
          ] })
        ] }),
        projectIdeas.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm uppercase tracking-wider", children: "Suggested Projects" }),
          projectIdeas.map((proj, i) => {
            var _a2;
            return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm", children: [
              /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 mb-1", children: proj.title }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mb-3", children: proj.description }),
              /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1 mb-4", children: (_a2 = proj.skills_gained) == null ? void 0 : _a2.map((s, j) => /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md uppercase", children: s }, j)) }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: () => handleGenerateBlueprint(proj),
                  className: "w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex justify-center items-center gap-1",
                  children: [
                    "Generate Blueprint ",
                    /* @__PURE__ */ jsx(ArrowRight, { className: "w-3 h-3" })
                  ]
                }
              )
            ] }, i);
          })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-6 border border-white/50 h-full", children: [
        /* @__PURE__ */ jsxs("h2", { className: "font-bold text-xl text-slate-900 mb-6 flex items-center gap-2", children: [
          "Portfolio Kanban",
          /* @__PURE__ */ jsx("span", { className: "text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-full", children: "Drag & Drop" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-4 h-[500px]", children: [
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: "bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col",
              onDragOver: handleDragOver,
              onDrop: (e) => handleDrop(e, "todo"),
              children: [
                /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-700 mb-4 flex items-center justify-between", children: [
                  "To Do",
                  /* @__PURE__ */ jsx("span", { className: "bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full", children: tasks.filter((t) => t.status === "todo").length })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "flex-1 space-y-3 overflow-y-auto", children: tasks.filter((t) => t.status === "todo").map((task) => /* @__PURE__ */ jsx(
                  "div",
                  {
                    draggable: true,
                    onDragStart: (e) => handleDragStart(e, task.id),
                    className: "bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-orange-300 transition-colors",
                    children: /* @__PURE__ */ jsx("p", { className: "font-medium text-sm text-slate-900", children: task.title })
                  },
                  task.id
                )) })
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: "bg-orange-50/30 rounded-2xl p-4 border border-orange-100/50 flex flex-col",
              onDragOver: handleDragOver,
              onDrop: (e) => handleDrop(e, "in-progress"),
              children: [
                /* @__PURE__ */ jsxs("h3", { className: "font-bold text-orange-800 mb-4 flex items-center justify-between", children: [
                  "In Progress",
                  /* @__PURE__ */ jsx("span", { className: "bg-orange-200 text-orange-700 text-xs px-2 py-0.5 rounded-full", children: tasks.filter((t) => t.status === "in-progress").length })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "flex-1 space-y-3 overflow-y-auto", children: tasks.filter((t) => t.status === "in-progress").map((task) => /* @__PURE__ */ jsx(
                  "div",
                  {
                    draggable: true,
                    onDragStart: (e) => handleDragStart(e, task.id),
                    className: "bg-white p-3 rounded-xl border border-orange-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-orange-400 transition-colors",
                    children: /* @__PURE__ */ jsx("p", { className: "font-medium text-sm text-slate-900", children: task.title })
                  },
                  task.id
                )) })
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: "bg-emerald-50/30 rounded-2xl p-4 border border-emerald-100/50 flex flex-col",
              onDragOver: handleDragOver,
              onDrop: (e) => handleDrop(e, "done"),
              children: [
                /* @__PURE__ */ jsxs("h3", { className: "font-bold text-emerald-800 mb-4 flex items-center justify-between", children: [
                  "Done",
                  /* @__PURE__ */ jsx("span", { className: "bg-emerald-200 text-emerald-700 text-xs px-2 py-0.5 rounded-full", children: tasks.filter((t) => t.status === "done").length })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "flex-1 space-y-3 overflow-y-auto", children: tasks.filter((t) => t.status === "done").map((task) => /* @__PURE__ */ jsx(
                  "div",
                  {
                    draggable: true,
                    onDragStart: (e) => handleDragStart(e, task.id),
                    className: "bg-white p-3 rounded-xl border border-emerald-200 shadow-sm cursor-grab active:cursor-grabbing opacity-70 hover:opacity-100 transition-all",
                    children: /* @__PURE__ */ jsx("p", { className: "font-medium text-sm text-slate-900 line-through decoration-slate-300", children: task.title })
                  },
                  task.id
                )) })
              ]
            }
          )
        ] })
      ] }) })
    ] }),
    activeBlueprint && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50", children: [
        /* @__PURE__ */ jsxs("h2", { className: "text-xl font-bold text-slate-900 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(FileCode2, { className: "w-6 h-6 text-orange-500" }),
          "Blueprint: ",
          activeBlueprint.title
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => setActiveBlueprint(null), className: "p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500", children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5" }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "p-6 overflow-y-auto flex-1", children: activeBlueprint.loading ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center py-20 text-slate-500", children: [
        /* @__PURE__ */ jsx(Loader2, { className: "w-12 h-12 animate-spin text-orange-500 mb-4" }),
        /* @__PURE__ */ jsx("p", { children: "Architecting your solution..." })
      ] }) : /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-bold text-slate-400 uppercase tracking-wider mb-3", children: "Architecture & Stack" }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-800 bg-orange-50 p-4 rounded-xl border border-orange-100", children: (_a = activeBlueprint.blueprint) == null ? void 0 : _a.architecture })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-bold text-slate-400 uppercase tracking-wider mb-3", children: "Setup Commands" }),
          /* @__PURE__ */ jsx("div", { className: "bg-slate-900 rounded-xl p-4 font-mono text-sm text-green-400 space-y-2 overflow-x-auto", children: (_c = (_b = activeBlueprint.blueprint) == null ? void 0 : _b.setup_commands) == null ? void 0 : _c.map((cmd, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Terminal, { className: "w-4 h-4 text-slate-600 shrink-0" }),
            /* @__PURE__ */ jsx("span", { children: cmd })
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-bold text-slate-400 uppercase tracking-wider mb-3", children: "Implementation Steps" }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: (_e = (_d = activeBlueprint.blueprint) == null ? void 0 : _d.steps) == null ? void 0 : _e.map((step, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-3 text-slate-700 bg-white border border-slate-200 p-3 rounded-xl shadow-sm", children: [
            /* @__PURE__ */ jsx("div", { className: "w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 text-xs font-bold", children: i + 1 }),
            /* @__PURE__ */ jsx("span", { className: "mt-0.5", children: step })
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-bold text-slate-400 uppercase tracking-wider mb-3", children: "README.md Draft" }),
          /* @__PURE__ */ jsx("pre", { className: "bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap font-mono", children: (_f = activeBlueprint.blueprint) == null ? void 0 : _f.readme_draft })
        ] })
      ] }) }),
      !activeBlueprint.loading && /* @__PURE__ */ jsx("div", { className: "p-6 border-t border-slate-100 bg-slate-50 flex justify-end", children: /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setActiveBlueprint(null),
          className: "px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors",
          children: "Close & View Kanban"
        }
      ) })
    ] }) })
  ] });
}
const SUB_META = {
  resume: { label: "Resume", icon: FileText, color: "emerald" },
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "blue" },
  github: { label: "GitHub", icon: Github, color: "purple" },
  keywords: { label: "Keywords", icon: Tags, color: "amber" }
};
function scoreColor$1(score) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-blue-600 dark:text-blue-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
function barColor(score) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}
function RecruiterVisibility() {
  var _a, _b;
  const [resumeText, setResumeText] = useState("");
  const [linkedinHeadline, setLinkedinHeadline] = useState("");
  const [linkedinAbout, setLinkedinAbout] = useState("");
  const [linkedinSkills, setLinkedinSkills] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [targetKeywords, setTargetKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const handleAnalyze = async (e) => {
    var _a2, _b2;
    e.preventDefault();
    const hasResume = resumeText.trim().length > 0;
    const hasLinkedin = linkedinHeadline.trim() || linkedinAbout.trim() || linkedinSkills.trim();
    const hasGithub = githubUsername.trim().length > 0;
    if (!hasResume && !hasLinkedin && !hasGithub) {
      setError("Provide at least one of: resume text, LinkedIn details, or GitHub username.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let github;
      if (hasGithub) {
        try {
          const { data: gh } = await api.post("/profiles/github/analyze", { username: githubUsername.trim() });
          github = gh;
        } catch {
          github = void 0;
        }
      }
      const linkedin = hasLinkedin ? { headline: linkedinHeadline, about: linkedinAbout, skills: linkedinSkills } : void 0;
      const { data } = await api.post("/recruiter-visibility/analyze", {
        resumeText: hasResume ? resumeText : void 0,
        linkedin,
        github,
        targetKeywords: targetKeywords.trim() || void 0
      });
      setResult(data.data);
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.error) || "Failed to analyze recruiter visibility");
    } finally {
      setLoading(false);
    }
  };
  const loadTestData = () => {
    setResumeText(
      "Senior Software Engineer. Led development of React and Node.js microservices serving 2M users. Improved API performance by 40% and reduced infrastructure costs by 25%. Built CI/CD pipelines with Docker, Kubernetes and AWS. Mentored 4 junior engineers. Stack: TypeScript, PostgreSQL, GraphQL, Redis. linkedin.com/in/janedoe · github.com/janedoe · jane.doe@email.com"
    );
    setLinkedinHeadline("Senior Software Engineer | React, Node.js, AWS | Building scalable platforms");
    setLinkedinAbout(
      "I build reliable, high-scale web platforms. Over the past 6 years I have led teams, shipped production features used by millions, and improved performance and developer experience across the stack."
    );
    setLinkedinSkills("React, Node.js, TypeScript, AWS, Docker, Kubernetes, PostgreSQL, GraphQL, Redis, CI/CD, System Design, Leadership");
    setGithubUsername("");
    setTargetKeywords("react, node, aws, graphql, kubernetes, typescript");
    setResult(null);
    setError("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-900 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "visibility" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Recruiter Visibility Checker" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Measure how attractive your profile looks to recruiters across your resume, LinkedIn, and GitHub." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto mb-12 glass-card border-blue-200/50 rounded-3xl p-8", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-blue-600", children: "info" }),
        "How It Works"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-slate-700 dark:text-slate-300", children: [
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "1. Add Your Profile Sources:" }),
          " Paste your resume, LinkedIn details, and/or GitHub username. You can fill in just one — we score what you provide and flag what's missing."
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "2. Visibility Scoring:" }),
          " We combine resume, LinkedIn, GitHub, and keyword-coverage signals into a single Recruiter Visibility Score (0-100) with per-source sub-scores."
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "3. Improve:" }),
          " Follow the ranked suggestions to raise the signals recruiters search and screen for."
        ] })
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 flex-shrink-0" }),
      error
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleAnalyze, className: "max-w-3xl mx-auto mb-12 space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-bold text-on-surface mb-3", children: [
          /* @__PURE__ */ jsx(FileText, { className: "w-4 h-4 text-emerald-600" }),
          " Resume Text"
        ] }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: resumeText,
            onChange: (e) => setResumeText(e.target.value),
            placeholder: "Paste your resume text here...",
            rows: 8,
            className: "w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 space-y-4", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-bold text-on-surface", children: [
          /* @__PURE__ */ jsx(Linkedin, { className: "w-4 h-4 text-blue-600" }),
          " LinkedIn (optional)"
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: linkedinHeadline,
            onChange: (e) => setLinkedinHeadline(e.target.value),
            placeholder: "Headline (e.g. Senior Software Engineer | React, Node.js, AWS)",
            className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          }
        ),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: linkedinAbout,
            onChange: (e) => setLinkedinAbout(e.target.value),
            placeholder: "About section...",
            rows: 3,
            className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: linkedinSkills,
            onChange: (e) => setLinkedinSkills(e.target.value),
            placeholder: "Skills, comma-separated (e.g. React, Node.js, AWS)",
            className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 space-y-4", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-bold text-on-surface", children: [
          /* @__PURE__ */ jsx(Github, { className: "w-4 h-4 text-purple-600" }),
          " GitHub Username (optional)"
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: githubUsername,
            onChange: (e) => setGithubUsername(e.target.value),
            placeholder: "e.g. janedoe",
            className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          }
        ),
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-bold text-on-surface pt-2", children: [
          /* @__PURE__ */ jsx(Tags, { className: "w-4 h-4 text-amber-600" }),
          " Target Role Keywords (optional)"
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: targetKeywords,
            onChange: (e) => setTargetKeywords(e.target.value),
            placeholder: "Keywords from your target job, comma-separated",
            className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-3 justify-center", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: loading,
            className: "px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-3",
            children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
              "Analyzing..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Eye, { className: "w-5 h-5" }),
              "Check Visibility"
            ] })
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: loadTestData,
            className: "px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-2xl font-bold transition-all flex items-center justify-center gap-3",
            children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "dataset" }),
              "Load Test Data"
            ]
          }
        )
      ] })
    ] }),
    result && !loading && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto space-y-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 text-center", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-2", children: "Recruiter Visibility Score" }),
        /* @__PURE__ */ jsx("p", { className: `text-6xl font-black ${scoreColor$1(result.visibilityScore)}`, children: result.visibilityScore }),
        /* @__PURE__ */ jsx("p", { className: "text-lg font-bold text-on-surface mt-2", children: result.scoreLabel }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 dark:text-slate-400 mt-2", children: result.scoreDescription })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: Object.entries(result.subScores).map(([key, sub]) => {
        const meta = SUB_META[key] || { label: key, icon: Eye };
        const Icon = meta.icon;
        return /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-2xl p-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Icon, { className: "w-5 h-5 text-slate-500" }),
              /* @__PURE__ */ jsx("span", { className: "font-bold text-on-surface", children: meta.label })
            ] }),
            sub.available ? /* @__PURE__ */ jsx("span", { className: `text-2xl font-black ${scoreColor$1(sub.score)}`, children: sub.score }) : /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-400 uppercase", children: "Not provided" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx(
            "div",
            {
              className: `h-full ${sub.available ? barColor(sub.score) : "bg-slate-300"} transition-all`,
              style: { width: `${sub.available ? sub.score : 0}%` }
            }
          ) }),
          key === "keywords" && sub.available && Array.isArray(sub.matched) && sub.matched.length > 0 && /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5 mt-3", children: sub.matched.slice(0, 10).map((kw) => /* @__PURE__ */ jsx("span", { className: "px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded text-xs font-medium", children: kw }, kw)) })
        ] }, key);
      }) }),
      ((_b = (_a = result.subScores.keywords) == null ? void 0 : _a.missing) == null ? void 0 : _b.length) > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-on-surface mb-3", children: "Keywords Recruiters Search For That You're Missing" }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: result.subScores.keywords.missing.map((kw) => /* @__PURE__ */ jsx("span", { className: "px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium", children: kw }, kw)) })
      ] }),
      result.suggestions.length > 0 && /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
          /* @__PURE__ */ jsx(Lightbulb, { className: "w-6 h-6 text-amber-500" }),
          /* @__PURE__ */ jsx("h3", { className: "text-xl font-bold text-on-surface", children: "Ranked Improvement Suggestions" })
        ] }),
        /* @__PURE__ */ jsx("ol", { className: "space-y-3", children: result.suggestions.map((s, i) => /* @__PURE__ */ jsxs("li", { className: "flex gap-3 text-slate-700 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx("span", { className: "flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-sm flex items-center justify-center", children: i + 1 }),
          /* @__PURE__ */ jsx("span", { children: s })
        ] }, i)) })
      ] })
    ] })
  ] });
}
const SEVERITY_STYLES = {
  high: "border-rose-300/60 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300",
  medium: "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
  low: "border-blue-300/60 bg-blue-50/60 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
};
function scoreColor(score) {
  if (score == null) return "text-slate-500";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
function ResumeConsistency() {
  var _a, _b, _c, _d;
  const [resumeText, setResumeText] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [githubText, setGithubText] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const parseField = (label, text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`${label} is not valid JSON. ${e.message}`);
    }
  };
  const handleCheck = async (e) => {
    var _a2, _b2;
    e.preventDefault();
    setError("");
    let resume, linkedin, github;
    try {
      resume = parseField("Resume", resumeText);
      linkedin = parseField("LinkedIn", linkedinText);
      github = parseField("GitHub", githubText);
    } catch (parseErr) {
      setError(parseErr.message);
      return;
    }
    if (!resume && !linkedin && !github) {
      setError("Provide at least two profiles (resume, LinkedIn, GitHub) to compare.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/resume-consistency/check", { resume, linkedin, github });
      setReport(data.data);
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.error) || "Failed to run consistency check");
    } finally {
      setLoading(false);
    }
  };
  const loadTestData = () => {
    setResumeText(
      JSON.stringify(
        {
          name: "Jane Doe",
          headline: "Senior Software Engineer",
          skills: ["JavaScript", "React", "Node.js", "PostgreSQL", "AWS"],
          projects: ["JobTune Platform", "Analytics Dashboard"],
          experience: [
            { title: "Senior Software Engineer", company: "TechCorp", startDate: "2021", endDate: "2024" },
            { title: "Software Engineer", company: "StartupXYZ", startDate: "2018", endDate: "2021" }
          ]
        },
        null,
        2
      )
    );
    setLinkedinText(
      JSON.stringify(
        {
          name: "Jane Doe",
          headline: "Full Stack Engineer",
          skills: ["JavaScript", "React", "TypeScript", "Docker"],
          experience: [
            { title: "Lead Software Engineer", company: "TechCorp", startDate: "2021", endDate: "2023" },
            { title: "Software Engineer", company: "StartupXYZ", startDate: "2018", endDate: "2021" }
          ]
        },
        null,
        2
      )
    );
    setGithubText(
      JSON.stringify(
        {
          username: "janedoe",
          repos: [
            { name: "JobTune Platform", language: "JavaScript" },
            { name: "ml-experiments", language: "Python" },
            { name: "go-cli-tool", language: "Go" }
          ]
        },
        null,
        2
      )
    );
    setReport(null);
    setError("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-900 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "fact_check" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Resume Consistency Checker" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Cross-check your resume against your LinkedIn and GitHub to catch missing projects, skill gaps, and conflicting titles or dates." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto mb-12 glass-card border-emerald-200/50 rounded-3xl p-8", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600", children: "info" }),
        "How It Works"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-slate-700 dark:text-slate-300", children: [
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "1. Provide your profile data" }),
          " as JSON for any two or more of: Resume, LinkedIn, GitHub."
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("p", { className: "mb-2", children: [
            /* @__PURE__ */ jsx("strong", { children: "2. We cross-compare them" }),
            " and flag:"
          ] }),
          /* @__PURE__ */ jsxs("ul", { className: "list-disc list-inside ml-4 space-y-1", children: [
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Projects Missing in Resume:" }),
              " GitHub repos not on your resume"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Skill gaps:" }),
              " skills on one profile but absent from another"
            ] }),
            /* @__PURE__ */ jsxs("li", { children: [
              /* @__PURE__ */ jsx("strong", { children: "Title & Date Mismatches:" }),
              " conflicting roles or dates for the same employer"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "3. Get a consistency score (0-100)" }),
          " and a categorized list of mismatches to fix."
        ] })
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 flex-shrink-0" }),
      error
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleCheck, className: "max-w-5xl mx-auto mb-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-bold text-on-surface mb-2", children: [
            /* @__PURE__ */ jsx(FileText, { className: "w-4 h-4 text-emerald-600" }),
            " Resume (JSON)"
          ] }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: resumeText,
              onChange: (e) => setResumeText(e.target.value),
              placeholder: '{ "skills": [...], "projects": [...], "experience": [...] }',
              rows: 12,
              className: "w-full font-mono text-xs bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-bold text-on-surface mb-2", children: [
            /* @__PURE__ */ jsx(Linkedin, { className: "w-4 h-4 text-blue-600" }),
            " LinkedIn (JSON)"
          ] }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: linkedinText,
              onChange: (e) => setLinkedinText(e.target.value),
              placeholder: '{ "headline": "...", "skills": [...], "experience": [...] }',
              rows: 12,
              className: "w-full font-mono text-xs bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-bold text-on-surface mb-2", children: [
            /* @__PURE__ */ jsx(Github, { className: "w-4 h-4 text-slate-700 dark:text-slate-300" }),
            " GitHub (JSON)"
          ] }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: githubText,
              onChange: (e) => setGithubText(e.target.value),
              placeholder: '{ "username": "...", "repos": [{ "name": "...", "language": "..." }] }',
              rows: 12,
              className: "w-full font-mono text-xs bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-col sm:flex-row gap-3 justify-center", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: loading,
            className: "px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-3",
            children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
              "Checking..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(GitCompare, { className: "w-5 h-5" }),
              "Check Consistency"
            ] })
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: loadTestData,
            className: "px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-2xl font-bold transition-all flex items-center justify-center gap-3",
            children: [
              /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "dataset" }),
              "Load Test Data"
            ]
          }
        )
      ] })
    ] }),
    report && !loading && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto space-y-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: "Consistency Score" }),
          /* @__PURE__ */ jsxs("p", { className: `text-6xl font-black ${scoreColor(report.consistencyScore)}`, children: [
            report.consistencyScore == null ? "N/A" : report.consistencyScore,
            report.consistencyScore != null && /* @__PURE__ */ jsx("span", { className: "text-2xl text-slate-400", children: "/100" })
          ] }),
          !((_a = report.summary) == null ? void 0 : _a.comparable) && /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-600 mt-2", children: "Provide at least two profiles for a score." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ jsx("strong", { children: ((_b = report.summary) == null ? void 0 : _b.totalMismatches) ?? 0 }),
            " mismatches found"
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-400 mt-1", children: [
            "Sources: ",
            (((_c = report.summary) == null ? void 0 : _c.sourcesProvided) || []).join(", ") || "none"
          ] })
        ] })
      ] }),
      (!report.mismatches || report.mismatches.length === 0) && /* @__PURE__ */ jsxs("div", { className: "glass-card border-emerald-200/50 rounded-3xl p-8 flex items-center gap-3 text-emerald-700 dark:text-emerald-300", children: [
        /* @__PURE__ */ jsx(CheckCircle, { className: "w-6 h-6 flex-shrink-0" }),
        /* @__PURE__ */ jsx("p", { className: "font-semibold", children: "No mismatches detected across the provided profiles." })
      ] }),
      (_d = report.mismatches) == null ? void 0 : _d.map((m, i) => /* @__PURE__ */ jsxs("div", { className: `glass-card rounded-3xl p-6 border ${SEVERITY_STYLES[m.severity] || ""}`, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
          /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-on-surface", children: m.category }),
          /* @__PURE__ */ jsx("span", { className: "text-xs font-bold uppercase px-3 py-1 rounded-full bg-white/50 dark:bg-black/20", children: m.severity })
        ] }),
        m.details && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-400 mb-3", children: m.details }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: m.items.map((item, j) => /* @__PURE__ */ jsxs("li", { className: "flex gap-3 text-sm text-slate-700 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx("span", { className: "font-bold flex-shrink-0", children: "•" }),
          /* @__PURE__ */ jsx("span", { children: item })
        ] }, j)) }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-400 mt-3", children: [
          m.source,
          " → ",
          m.target
        ] })
      ] }, i)),
      /* @__PURE__ */ jsxs("p", { className: "text-center text-xs text-slate-400", children: [
        "Generated at ",
        new Date(report.generatedAt).toLocaleString()
      ] })
    ] })
  ] });
}
function AchievementEnhancer() {
  const [achievements, setAchievements] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const handleEnhance = async (e) => {
    var _a, _b;
    e.preventDefault();
    if (!achievements.trim()) {
      setError("Please enter at least one achievement.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/jobs/achievement-enhancer/enhance", {
        achievements,
        role
      });
      setResult(data.data);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Failed to enhance achievements");
    } finally {
      setLoading(false);
    }
  };
  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2e3);
  };
  const handleCopyAll = () => {
    var _a;
    if (!((_a = result == null ? void 0 : result.bullets) == null ? void 0 : _a.length)) return;
    navigator.clipboard.writeText(result.bullets.map((b) => `• ${b}`).join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2e3);
  };
  const loadTestData = () => {
    setAchievements("Created Attendance System\nHelped onboard new team members\nMade a dashboard for sales");
    setRole("Software Engineer");
    setResult(null);
    setError("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl mx-auto py-16 px-4 sm:px-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center mb-16", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6", children: /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-slate-900 text-3xl", style: { fontVariationSettings: "'FILL' 0" }, children: "auto_awesome" }) }),
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-on-surface font-headline mb-4", children: "Achievement Enhancer" }),
      /* @__PURE__ */ jsx("p", { className: "text-lg text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Turn plain achievements into polished, impact-driven resume bullets." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto mb-12 glass-card border-emerald-200/50 rounded-3xl p-8", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-xl font-bold text-on-surface mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-emerald-600", children: "info" }),
        "How It Works"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-slate-700 dark:text-slate-300", children: [
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "1. List your achievements" }),
          ' — one per line. They can be rough, e.g. "Created Attendance System".'
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "2. (Optional) Add your target role" }),
          " to tailor the phrasing."
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          /* @__PURE__ */ jsx("strong", { children: "3. Enhance" }),
          " — each line becomes a professional resume bullet starting with a strong action verb and conveying impact."
        ] })
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(AlertCircle, { className: "w-5 h-5 flex-shrink-0" }),
      error
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [
      /* @__PURE__ */ jsxs("form", { onSubmit: handleEnhance, className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Target Role / Context" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: role,
              onChange: (e) => setRole(e.target.value),
              placeholder: "e.g., Software Engineer (optional)",
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "block text-sm font-bold text-on-surface mb-2", children: "Your Achievements * (one per line)" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: achievements,
              onChange: (e) => setAchievements(e.target.value),
              placeholder: "Created Attendance System\nHelped onboard new team members",
              rows: 8,
              className: "w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: loading,
              className: "px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-3",
              children: loading ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined animate-spin text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "sync" }),
                "Enhancing..."
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Sparkles, { className: "w-5 h-5" }),
                "Enhance Achievements"
              ] })
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: loadTestData,
              className: "px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-xl font-bold transition-all flex items-center justify-center gap-3",
              children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-lg", style: { fontVariationSettings: "'FILL' 0" }, children: "dataset" }),
                "Load Test Data"
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "h-full", children: result ? /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-8 h-full flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700", children: [
          /* @__PURE__ */ jsxs("h3", { className: "text-lg font-bold text-on-surface", children: [
            "Enhanced Bullets ",
            /* @__PURE__ */ jsxs("span", { className: "text-sm font-normal text-slate-400", children: [
              "(",
              result.count,
              ")"
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleCopyAll,
              className: "px-3 py-1.5 text-sm font-medium hover:bg-surface-container/50 rounded-lg transition-colors flex items-center gap-1.5",
              title: "Copy all",
              children: copiedAll ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4 text-emerald-600" }),
                " Copied"
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Copy, { className: "w-4 h-4 text-slate-600" }),
                " Copy all"
              ] })
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto space-y-3", children: result.results.map((item, idx) => /* @__PURE__ */ jsxs("div", { className: "group bg-surface-container/40 rounded-2xl p-4 border border-outline/10", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-800 dark:text-slate-200 leading-relaxed", children: item.enhanced }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => handleCopy(item.enhanced, idx),
                className: "p-1.5 hover:bg-surface-container/70 rounded-lg transition-colors flex-shrink-0",
                title: "Copy",
                children: copiedIdx === idx ? /* @__PURE__ */ jsx(CheckCircle, { className: "w-4 h-4 text-emerald-600" }) : /* @__PURE__ */ jsx(Copy, { className: "w-4 h-4 text-slate-500" })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-slate-400 italic", children: [
            "From: ",
            item.original
          ] })
        ] }, idx)) }),
        /* @__PURE__ */ jsx("div", { className: "mt-6 pt-6 border-t border-slate-200 dark:border-slate-700", children: /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-400", children: [
          result.source === "ai" ? "AI-enhanced" : "Rule-based",
          " · Generated at ",
          new Date(result.generatedAt).toLocaleString()
        ] }) })
      ] }) : /* @__PURE__ */ jsx("div", { className: "glass-card bg-surface-container/30 rounded-3xl p-8 h-full flex items-center justify-center border-2 border-dashed border-outline/20", children: /* @__PURE__ */ jsx("p", { className: "text-center text-slate-500 dark:text-slate-400", children: 'Enter your achievements and click "Enhance Achievements" to see polished resume bullets here.' }) }) })
    ] })
  ] });
}
function ComingSoon({
  toolName = "This tool",
  description = "We're building this feature right now. Check back soon!"
}) {
  return /* @__PURE__ */ jsx("div", { className: "max-w-3xl mx-auto py-20 px-4 sm:px-6 w-full text-center", children: /* @__PURE__ */ jsxs("div", { className: "glass-card rounded-3xl p-12", children: [
    /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-6", children: /* @__PURE__ */ jsx(Sparkles, { className: "w-8 h-8" }) }),
    /* @__PURE__ */ jsx("div", { className: "text-blue-600 font-bold text-sm uppercase tracking-widest mb-2", children: "Coming Soon" }),
    /* @__PURE__ */ jsx("h1", { className: "text-3xl font-black text-slate-900 tracking-tight mb-3", children: toolName }),
    /* @__PURE__ */ jsx("p", { className: "text-slate-500 font-medium max-w-md mx-auto mb-8", children: description }),
    /* @__PURE__ */ jsxs(
      Link,
      {
        to: "/dashboard",
        className: "inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all active:scale-95",
        children: [
          /* @__PURE__ */ jsx(ArrowLeft, { className: "w-4 h-4" }),
          " Back to Dashboard"
        ]
      }
    )
  ] }) });
}
function SessionBlocked() {
  const { sessionBlockedMessage, clearSessionBlocked, logout } = useAuthStore();
  const handleSignInAgain = async () => {
    clearSessionBlocked();
    await logout();
    window.location.href = "/login";
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full text-center glass-card rounded-3xl p-10 border border-rose-200/50 dark:border-rose-900/40", children: [
    /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-100 dark:bg-rose-900/30 mb-6", children: /* @__PURE__ */ jsx(MonitorOff, { className: "w-10 h-10 text-rose-600 dark:text-rose-400" }) }),
    /* @__PURE__ */ jsx("h1", { className: "text-2xl font-black text-slate-900 dark:text-white mb-3", children: "Session ended" }),
    /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-400 mb-8 leading-relaxed", children: sessionBlockedMessage || "This account is only allowed on one device at a time. It was signed in elsewhere, so this session was closed." }),
    /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mb-8", children: "To prevent account sharing, JobTune allows a single active session per user." }),
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: handleSignInAgain,
        className: "w-full py-3.5 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mb-3",
        children: [
          /* @__PURE__ */ jsx(LogIn, { className: "w-5 h-5" }),
          "Sign in on this device"
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      Link,
      {
        to: "/",
        className: "block text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors",
        children: "Back to home"
      }
    )
  ] }) });
}
function ProtectedRoute({ children, requireOnboarding = false }) {
  const { isAuthenticated, hasCompletedOnboarding } = useAuthStore();
  const { onboardingComplete } = useSubscriptionStore();
  if (!isAuthenticated) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  if (requireOnboarding && !hasCompletedOnboarding) return /* @__PURE__ */ jsx(Navigate, { to: "/onboarding", replace: true });
  if (requireOnboarding && !onboardingComplete) return /* @__PURE__ */ jsx(Navigate, { to: "/onboarding", replace: true });
  return children;
}
function ProtectedToolRoute({ children, toolPath }) {
  const { isAuthenticated } = useAuthStore();
  const { onboardingComplete, onboardingChecked, getUserPlan } = useSubscriptionStore();
  useEffect(() => {
    if (isAuthenticated) {
      getUserPlan();
    }
  }, [isAuthenticated, getUserPlan]);
  if (!isAuthenticated) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  if (!onboardingChecked) {
    return /* @__PURE__ */ jsx("div", { className: "w-full min-h-[60vh] flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 mb-4 animate-spin", children: /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full border-2 border-white border-t-transparent" }) }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-600 font-semibold", children: "Loading your tools..." })
    ] }) });
  }
  if (!onboardingComplete) return /* @__PURE__ */ jsx(Navigate, { to: "/onboarding", replace: true });
  const toolName = getToolForRoute(toolPath);
  if (!toolName) return children;
  const requiredPlan = getRequiredPlan(toolName);
  return /* @__PURE__ */ jsx(PlanGate, { toolName, requiredPlan, children });
}
function App() {
  const { checkAuth, isLoading, sessionBlocked } = useAuthStore();
  const { checkOnboarded } = useSubscriptionStore();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!isBrowser) return;
    checkAuth().then(() => checkOnboarded());
  }, [checkAuth, checkOnboarded]);
  if (hydrated && sessionBlocked) {
    return /* @__PURE__ */ jsx(SessionBlocked, {});
  }
  if (hydrated && isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 mb-4 animate-spin", children: /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full border-2 border-white border-t-transparent" }) }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-600 font-semibold", children: "Loading..." })
    ] }) });
  }
  return /* @__PURE__ */ jsx(ErrorBoundary, { children: /* @__PURE__ */ jsxs(Routes, { children: [
    /* @__PURE__ */ jsxs(Route, { path: "/", element: /* @__PURE__ */ jsx(Layout, {}), children: [
      /* @__PURE__ */ jsx(Route, { index: true, element: /* @__PURE__ */ jsx(Home, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "onboarding", element: /* @__PURE__ */ jsx(Onboarding, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "payment-confirm", element: /* @__PURE__ */ jsx(PaymentConfirm, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "skills", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/skills", children: /* @__PURE__ */ jsx(SkillAssessment, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "resume", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/resume", children: /* @__PURE__ */ jsx(ResumeOptimizer, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "resume/build", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/resume/build", children: /* @__PURE__ */ jsx(ResumeBuilder, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "resume/history", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/resume/history", children: /* @__PURE__ */ jsx(ResumeHistory, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "resume/compare", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/resume/compare", children: /* @__PURE__ */ jsx(ResumeComparison, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "resume/send", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/resume/send", children: /* @__PURE__ */ jsx(ResumeSend, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "linkedin", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/linkedin", children: /* @__PURE__ */ jsx(LinkedInOptimizer, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "github", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/github", children: /* @__PURE__ */ jsx(GitHubOptimizer, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "portfolio", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/portfolio", children: /* @__PURE__ */ jsx(PortfolioBuilder, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "preparation", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/preparation", children: /* @__PURE__ */ jsx(JobPreparation, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "preparation/tune-and-polish", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/preparation/tune-and-polish", children: /* @__PURE__ */ jsx(TuneAndPolishTrack, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "preparation/zero-to-hero", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/preparation/zero-to-hero", children: /* @__PURE__ */ jsx(ZeroToHeroTrack, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "preparation/learn-and-build", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/preparation/learn-and-build", children: /* @__PURE__ */ jsx(LearnAndBuildTrack, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "learning", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/learning", children: /* @__PURE__ */ jsx(ContentVault, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "projects", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/projects", children: /* @__PURE__ */ jsx(ProjectIdeas, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "blog", element: /* @__PURE__ */ jsx(BlogList, {}) }),
      /* @__PURE__ */ jsx(
        Route,
        {
          path: "dashboard",
          element: /* @__PURE__ */ jsx(ProtectedRoute, { children: /* @__PURE__ */ jsx(Dashboard, {}) })
        }
      ),
      /* @__PURE__ */ jsx(
        Route,
        {
          path: "dashboard/settings/plans",
          element: /* @__PURE__ */ jsx(ProtectedRoute, { children: /* @__PURE__ */ jsx(PlanSettings, {}) })
        }
      ),
      /* @__PURE__ */ jsx(Route, { path: "interview", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/interview", children: /* @__PURE__ */ jsx(MockInterview, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "jobmatch", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/jobmatch", children: /* @__PURE__ */ jsx(JobMatcher, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "discover", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/discover", children: /* @__PURE__ */ jsx(JobDiscovery, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "jobs", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/jobs", children: /* @__PURE__ */ jsx(JobTracker, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "career", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/career", children: /* @__PURE__ */ jsx(CareerRoadmap, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "job-analyzer", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/job-analyzer", children: /* @__PURE__ */ jsx(JobAnalyzer, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "ats-checker", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/ats-checker", children: /* @__PURE__ */ jsx(ATSCheckerV2, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "job-fit", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/job-fit", children: /* @__PURE__ */ jsx(JobFitAnalysis, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "cover-letter", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/cover-letter", children: /* @__PURE__ */ jsx(CoverLetterGenerator, {}) }) }),
      /* @__PURE__ */ jsx(
        Route,
        {
          path: "evidence",
          element: /* @__PURE__ */ jsx(ProtectedRoute, { children: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/evidence", children: /* @__PURE__ */ jsx(EvidenceDashboard, {}) }) })
        }
      ),
      /* @__PURE__ */ jsx(Route, { path: "recruiter-visibility", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/recruiter-visibility", children: /* @__PURE__ */ jsx(RecruiterVisibility, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "resume-consistency", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/resume-consistency", children: /* @__PURE__ */ jsx(ResumeConsistency, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "achievement-enhancer", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/achievement-enhancer", children: /* @__PURE__ */ jsx(AchievementEnhancer, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "career-readiness", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/career-readiness", children: /* @__PURE__ */ jsx(ComingSoon, { toolName: "Career Readiness Dashboard", description: "A unified career score with progress tracking and improvement recommendations across your whole journey. Launching soon." }) }) })
    ] }),
    /* @__PURE__ */ jsx(Route, { path: "/login", element: /* @__PURE__ */ jsx(Login, {}) })
  ] }) });
}
const SSR_PATHS = /* @__PURE__ */ new Set(["/", "/blog", "/login"]);
const DEFAULT_META = {
  title: "JobTune — AI Career Preparation Ecosystem",
  description: "Skill assessment, resume optimization, interview prep, and job tracking — one connected ecosystem for tech careers."
};
const ROUTE_META = {
  "/": {
    title: "JobTune — Your AI-Powered Career Ecosystem",
    description: "Assess skills, optimize your resume and profiles, practice interviews, and land your dream tech role with JobTune."
  },
  "/blog": {
    title: "JobTune Blog — Career & Interview Insights",
    description: "Resume tips, interview strategies, and AI-powered job search advice for students and early-career professionals."
  },
  "/login": {
    title: "Sign In — JobTune",
    description: "Sign in to your JobTune account and access your personalized career tools."
  }
};
function normalizePathname(pathname = "/") {
  const path = pathname.split("?")[0].split("#")[0];
  if (path === "/" || path === "") return "/";
  return path.replace(/\/+$/, "") || "/";
}
function getRenderStrategy(pathname) {
  return SSR_PATHS.has(normalizePathname(pathname)) ? "ssr" : "csr";
}
function getRouteMeta(pathname) {
  return ROUTE_META[normalizePathname(pathname)] || DEFAULT_META;
}
function buildHeadTags(pathname) {
  const { title, description } = getRouteMeta(pathname);
  return `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
  `.trim();
}
function resetStoresForSsr() {
  useAuthStore.setState({
    user: null,
    sessionId: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    hasCompletedOnboarding: false
  });
  useSubscriptionStore.setState({
    userPlan: null,
    recommendation: null,
    onboardingComplete: false,
    onboardingChecked: false,
    isLoading: false
  });
}
function render(url) {
  resetStoresForSsr();
  const html = renderToString(
    /* @__PURE__ */ jsx(StaticRouter, { location: url, children: /* @__PURE__ */ jsx(App, {}) })
  );
  const head = buildHeadTags(url);
  return { html, head };
}
export {
  buildHeadTags,
  getRenderStrategy,
  normalizePathname,
  render
};
