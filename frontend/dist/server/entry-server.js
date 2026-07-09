var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { useState, useEffect, useRef, useMemo, Component, lazy, Suspense } from "react";
import { stripBasename, UNSAFE_warning, UNSAFE_invariant, matchPath, joinPaths, Action } from "@remix-run/router";
import { UNSAFE_NavigationContext, useHref, useNavigate, useLocation, useResolvedPath, createPath, UNSAFE_DataRouterStateContext, UNSAFE_useRouteId, UNSAFE_RouteContext, UNSAFE_DataRouterContext, parsePath, Router, Outlet, Navigate, Routes, Route } from "react-router";
import "react-dom";
import { ChevronDown, Sun, Moon, Crown, X, Menu, AlertTriangle, RotateCcw, TrendingUp, Zap, Lock, ArrowRight, Sparkles, Star, Activity, FileText, Linkedin, Github, Layout as Layout$1, BookOpen, Lightbulb, CheckCircle2, Users, ChevronRight, Briefcase, ShieldCheck, Monitor, Mail, Calendar, User, MonitorOff, LogIn } from "lucide-react";
import { create } from "zustand";
import axios from "axios";
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
    navigator,
    basename
  } = React.useContext(UNSAFE_NavigationContext);
  let isTransitioning = routerState != null && // Conditional usage is OK here because the usage of a data router is static
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useViewTransitionState(path) && viewTransition === true;
  let toPathname = navigator.encodeLocation ? navigator.encodeLocation(path).pathname : path.pathname;
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
    { label: "Cover Letter", path: "/cover-letter", desc: "AI-generated letters" },
    { label: "Achievement Enhancer", path: "/achievement-enhancer", desc: "Turn tasks into impact bullets" },
    { label: "Resume Consistency", path: "/resume-consistency", desc: "Cross-check resume vs profiles" }
  ] },
  { label: "Portfolios", items: [
    { label: "GitHub Profile", path: "/github", desc: "Audit & generate README" },
    { label: "LinkedIn Profile", path: "/linkedin", desc: "Score your LinkedIn presence" },
    { label: "Recruiter Visibility", path: "/recruiter-visibility", desc: "How recruiters see you" }
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
const PRIMARY_NAV_LINKS = [
  { label: "Dashboard", path: "/dashboard", exact: true },
  { label: "Resume Forge", path: "/resume", prefix: true },
  { label: "Blog", path: "/blog", exact: true }
];
const MOBILE_PRIMARY_LINKS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Resume Forge", path: "/resume" },
  { label: "Blog", path: "/blog" }
];
const Navbar = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userPlan = useSubscriptionStore((s) => s.userPlan);
  const [isDark, setIsDark] = useDarkMode();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [openMobileGroup, setOpenMobileGroup] = useState(null);
  const [prepUnlocked, setPrepUnlocked] = useState(false);
  const dropdownRef = useRef(null);
  useEffect(() => {
    if (!isAuthenticated) {
      setPrepUnlocked(false);
      return;
    }
    const recheck = () => {
      api.get("/progress/preferences").then(({ data }) => {
        var _a;
        if ((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.prepOnboardingDone) setPrepUnlocked(true);
      }).catch(() => {
      });
    };
    const handleReset = () => setPrepUnlocked(false);
    recheck();
    window.addEventListener("prep-onboarding-complete", recheck);
    window.addEventListener("prep-onboarding-reset", handleReset);
    return () => {
      window.removeEventListener("prep-onboarding-complete", recheck);
      window.removeEventListener("prep-onboarding-reset", handleReset);
    };
  }, [isAuthenticated]);
  const NAV_GROUPS = useMemo(() => [
    ...BASE_NAV_GROUPS,
    {
      label: "Preparation",
      items: prepUnlocked ? PREP_ITEMS_UNLOCKED : PREP_ITEM_LOCKED
    }
  ], [prepUnlocked]);
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
  return /* @__PURE__ */ jsxs("header", { className: "fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center px-5 lg:px-8 h-16 w-full max-w-[1400px] mx-auto gap-4", children: [
      /* @__PURE__ */ jsx(Link, { to: "/", className: "text-xl font-extrabold tracking-tight text-blue-700 dark:text-blue-400 font-headline flex-shrink-0 mr-1 leading-none", children: "JobTune" }),
      /* @__PURE__ */ jsxs("nav", { className: "hidden lg:flex items-center gap-1 flex-1 justify-center min-w-0", ref: dropdownRef, children: [
        PRIMARY_NAV_LINKS.map((link) => {
          const isActive = link.exact ? location.pathname === link.path : location.pathname.startsWith(link.path);
          return /* @__PURE__ */ jsx(
            Link,
            {
              to: link.path,
              className: `px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${isActive ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`,
              children: link.label
            },
            link.path
          );
        }),
        NAV_GROUPS.map((group) => {
          const active = isGroupActive(group);
          const isOpen = openGroup === group.label;
          return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setOpenGroup(isOpen ? null : group.label),
                className: `flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${active || isOpen ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`,
                children: [
                  group.label,
                  /* @__PURE__ */ jsx(ChevronDown, { className: `w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}` })
                ]
              }
            ),
            isOpen && /* @__PURE__ */ jsx("div", { className: "absolute top-full left-0 mt-3 w-60 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-fade-in", children: group.items.map((item) => /* @__PURE__ */ jsxs(
              Link,
              {
                to: item.path,
                className: `flex flex-col px-4 py-2.5 mx-1.5 rounded-lg transition-colors ${location.pathname === item.path ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`,
                children: [
                  /* @__PURE__ */ jsx("span", { className: `text-sm font-semibold ${location.pathname === item.path ? "text-blue-700 dark:text-blue-400" : "text-slate-800 dark:text-slate-200"}`, children: item.label }),
                  /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400 dark:text-slate-500 mt-0.5", children: item.desc })
                ]
              },
              item.path
            )) })
          ] }, group.label);
        })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 flex-shrink-0 ml-auto", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setIsDark(!isDark),
            title: isDark ? "Light mode" : "Dark mode",
            className: "w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
            children: isDark ? /* @__PURE__ */ jsx(Sun, { className: "w-[18px] h-[18px]" }) : /* @__PURE__ */ jsx(Moon, { className: "w-[18px] h-[18px]" })
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "hidden md:flex items-center gap-1.5 border-l pl-3 ml-1 border-slate-200 dark:border-slate-700", children: isAuthenticated ? /* @__PURE__ */ jsxs(Fragment, { children: [
          userPlan && /* @__PURE__ */ jsxs(
            Link,
            {
              to: "/dashboard/settings/plans",
              className: "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors",
              title: "Manage or switch your plan",
              children: [
                /* @__PURE__ */ jsx(Crown, { className: "w-3.5 h-3.5 text-blue-600 dark:text-blue-400" }),
                /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-blue-700 dark:text-blue-300 hidden sm:inline", children: userPlan.name })
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: logout,
              title: "Logout",
              className: "flex items-center gap-1.5 text-sm text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-medium transition-colors px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20",
              children: [
                /* @__PURE__ */ jsx("span", { className: "material-symbols-outlined text-[16px]", style: { fontVariationSettings: "'FILL' 0" }, children: "logout" }),
                /* @__PURE__ */ jsx("span", { className: "hidden lg:inline text-xs font-semibold leading-none", children: "Sign Out" })
              ]
            }
          ),
          /* @__PURE__ */ jsx("div", { className: "h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden border-2 border-blue-200 dark:border-blue-800 shrink-0", children: /* @__PURE__ */ jsx("img", { alt: "User avatar", className: "w-full h-full object-cover", src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${(user == null ? void 0 : user.id) || "42"}` }) })
        ] }) : /* @__PURE__ */ jsx(
          Link,
          {
            to: "/login",
            className: "px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors",
            children: "Sign In"
          }
        ) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setMobileOpen((prev) => !prev),
            className: "lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
            "aria-label": "Toggle menu",
            children: mobileOpen ? /* @__PURE__ */ jsx(X, { className: "w-5 h-5" }) : /* @__PURE__ */ jsx(Menu, { className: "w-5 h-5" })
          }
        )
      ] })
    ] }),
    mobileOpen && /* @__PURE__ */ jsx("div", { className: "lg:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-lg max-h-[80vh] overflow-y-auto animate-fade-in", children: /* @__PURE__ */ jsxs("nav", { className: "flex flex-col px-4 py-3 gap-0.5 w-full", children: [
      MOBILE_PRIMARY_LINKS.map((link) => /* @__PURE__ */ jsx(
        Link,
        {
          to: link.path,
          className: `py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${location.pathname === link.path || location.pathname.startsWith(link.path + "/") ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`,
          children: link.label
        },
        link.path
      )),
      NAV_GROUPS.map((group) => {
        const isOpen = openMobileGroup === group.label;
        return /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setOpenMobileGroup(isOpen ? null : group.label),
              className: "flex items-center justify-between py-2.5 px-4 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
              children: [
                group.label,
                /* @__PURE__ */ jsx(ChevronDown, { className: `w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}` })
              ]
            }
          ),
          isOpen && /* @__PURE__ */ jsx("div", { className: "flex flex-col pl-4 border-l-2 border-slate-100 dark:border-slate-800 ml-6 mt-0.5 gap-0.5", children: group.items.map((item) => /* @__PURE__ */ jsx(
            Link,
            {
              to: item.path,
              className: `py-2 px-3 rounded-lg text-sm transition-colors ${location.pathname === item.path ? "text-blue-700 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/40" : "text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`,
              children: item.label
            },
            item.path
          )) })
        ] }, group.label);
      }),
      /* @__PURE__ */ jsx("div", { className: "border-t border-slate-100 dark:border-slate-800 mt-2 pt-2 flex items-center justify-between px-4", children: isAuthenticated ? /* @__PURE__ */ jsx(
        "button",
        {
          onClick: logout,
          className: "flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 font-semibold px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20",
          children: "Sign Out"
        }
      ) : /* @__PURE__ */ jsx(Link, { to: "/login", className: "px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold", children: "Sign In" }) })
    ] }) })
  ] });
};
const Layout = () => {
  const location = useLocation();
  const isFullScreenPage = location.pathname === "/payment-confirm";
  if (isFullScreenPage) {
    return /* @__PURE__ */ jsx(Outlet, {});
  }
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen flex flex-col font-body bg-slate-50 dark:bg-[#030712] text-slate-900 dark:text-slate-100 antialiased overflow-x-hidden relative transition-colors duration-300", children: [
    /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 z-0 overflow-hidden pointer-events-none", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute top-[-15%] left-[-15%] w-[50%] h-[50%] rounded-full bg-blue-200/40 mix-blend-multiply filter blur-[140px] opacity-50 animate-blob dark:bg-blue-950/30 dark:mix-blend-screen" }),
      /* @__PURE__ */ jsx("div", { className: "absolute top-[-10%] right-[-15%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 mix-blend-multiply filter blur-[140px] opacity-50 animate-blob dark:bg-indigo-950/30 dark:mix-blend-screen", style: { animationDelay: "3s" } }),
      /* @__PURE__ */ jsx("div", { className: "absolute bottom-[-25%] left-[15%] w-[50%] h-[50%] rounded-full bg-cyan-200/30 mix-blend-multiply filter blur-[140px] opacity-40 animate-blob dark:bg-cyan-950/20 dark:mix-blend-screen", style: { animationDelay: "6s" } })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relative z-10 w-full flex flex-col flex-grow", children: [
      /* @__PURE__ */ jsx(Navbar, {}),
      /* @__PURE__ */ jsx("div", { className: "flex-grow flex pt-16", children: /* @__PURE__ */ jsx(Outlet, {}) }),
      /* @__PURE__ */ jsx("footer", { className: "w-full bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border-t border-slate-200/50 dark:border-slate-800/50 relative z-10", children: /* @__PURE__ */ jsxs("div", { className: "max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center px-6 py-6 gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-sm text-slate-400 dark:text-slate-500 font-medium", children: [
          "© ",
          (/* @__PURE__ */ new Date()).getFullYear(),
          " JobTune AI"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex gap-6", children: ["Privacy Policy", "Terms of Service", "Help Center"].map((label) => /* @__PURE__ */ jsx("a", { className: "text-sm text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium", href: "#", children: label }, label)) })
      ] }) })
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
      return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6", children: /* @__PURE__ */ jsx(AlertTriangle, { className: "w-8 h-8 text-red-600" }) }),
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-extrabold text-slate-900 mb-2", children: "Something went wrong" }),
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
  "AI Tutor": "Learn & Build",
  "Doubt Solver": "Learn & Build",
  "Course Library": "Learn & Build",
  "Learning Paths": "Learn & Build",
  "AI Notes Generator": "Learn & Build",
  "AI Flashcards": "Learn & Build",
  "AI Quiz Generator": "Learn & Build",
  "Community Hub": "Learn & Build",
  "Coding Practice": "Learn & Build",
  "Assessments": "Learn & Build",
  "AI Project Builder": "Learn & Build",
  "Project Workspace": "Learn & Build",
  // Tune & Polish tier (₹299/month) — includes everything above, plus:
  "Resume Optimizer": "Tune & Polish",
  "ATS Checker": "Tune & Polish",
  "LinkedIn Optimizer": "Tune & Polish",
  "GitHub Optimizer": "Tune & Polish",
  "Recruiter Visibility Checker": "Tune & Polish",
  "Resume Consistency Checker": "Tune & Polish",
  "Achievement Enhancer": "Tune & Polish",
  "Application Assistant": "Tune & Polish",
  "Communication Skills": "Tune & Polish",
  "AI Code Reviewer": "Tune & Polish",
  // Zero To Hero tier (₹499/month) — includes everything above, plus:
  "Interview Prep": "Zero to Hero",
  "Job Analytics": "Zero to Hero",
  "Career Readiness Dashboard": "Zero to Hero",
  "AI Career Coach": "Zero to Hero",
  "University Dashboard": "Zero to Hero",
  "Faculty Panel": "Zero to Hero",
  "Recruiter Portal": "Zero to Hero",
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
  "/job-analyzer": "Job Analyzer",
  "/ai-tutor": "AI Tutor",
  "/doubt-solver": "Doubt Solver",
  "/courses": "Course Library",
  "/learning-paths": "Learning Paths",
  "/notes": "AI Notes Generator",
  "/flashcards": "AI Flashcards",
  "/quiz": "AI Quiz Generator",
  "/community": "Community Hub",
  "/communication-skills": "Communication Skills",
  "/coding-practice": "Coding Practice",
  "/assessments": "Assessments",
  "/project-builder": "AI Project Builder",
  "/project-workspace": "Project Workspace",
  "/career-coach": "AI Career Coach",
  "/code-reviewer": "AI Code Reviewer",
  "/university-dashboard": "University Dashboard",
  "/faculty-panel": "Faculty Panel",
  "/recruiter-portal": "Recruiter Portal"
};
const PLAN_TIERS = {
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
  const { userPlan } = useSubscriptionStore();
  if (!userPlan) {
    return fallback || /* @__PURE__ */ jsx("div", { className: "w-full min-h-[40vh] flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "inline-block w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-3" }),
      /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-sm font-medium", children: "Checking access..." })
    ] }) });
  }
  const userTier = PLAN_TIERS[userPlan.name] || 0;
  const requiredTier = PLAN_TIERS[requiredPlan] || PLAN_TIERS[TOOL_ACCESS[toolName]] || 1;
  const hasAccess = userTier >= requiredTier;
  if (hasAccess) return children;
  const planConfig = PLAN_COLORS[requiredPlan] || PLAN_COLORS["Tune & Polish"];
  const IconComponent = planConfig.icon;
  return /* @__PURE__ */ jsx("div", { className: "w-full min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full text-center", children: [
    /* @__PURE__ */ jsx("div", { className: `inline-flex items-center justify-center w-20 h-20 rounded-full bg-${planConfig.color}-100 dark:bg-${planConfig.color}-900/30 mb-6`, children: /* @__PURE__ */ jsx(Lock, { className: `w-10 h-10 text-${planConfig.color}-600 dark:text-${planConfig.color}-400` }) }),
    /* @__PURE__ */ jsxs("h1", { className: "text-3xl font-extrabold text-slate-900 dark:text-white mb-3", children: [
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
const STEPS = [
  { num: "01", title: "Assess", desc: "A 45-min diagnostic maps your exact technical standing across 25+ domains." },
  { num: "02", title: "Optimize", desc: "AI rewrites your resume, LinkedIn headline, and GitHub profile for recruiters." },
  { num: "03", title: "Learn", desc: "A personalized path fills every gap the assessment found — nothing extra." },
  { num: "04", title: "Build", desc: "Ship real projects using guided templates and host them with one click." }
];
function SectionBadge({ children }) {
  return /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold tracking-widest uppercase", children });
}
function DarkBadge({ children }) {
  return /* @__PURE__ */ jsx("span", { className: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/8 border border-slate-200 dark:border-white/10 text-blue-300 text-xs font-bold tracking-widest uppercase", children });
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
  return /* @__PURE__ */ jsxs("div", { className: "bg-slate-900/80 rounded-2xl p-6 space-y-4 shadow-glass backdrop-blur-md border border-slate-200 dark:border-white/10", children: [
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
      /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500", children: [
        "Gap detected: ",
        /* @__PURE__ */ jsx("span", { className: "text-amber-400 font-semibold", children: "System Design" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "bg-blue-500/8 rounded-xl p-3 border border-blue-500/15", children: /* @__PURE__ */ jsx("p", { className: "text-xs text-blue-300 font-medium", children: "✦ Suggested path: System Design for SDE-1" }) })
  ] });
}
function ResumeVisual() {
  return /* @__PURE__ */ jsxs("div", { className: "bg-slate-900/80 rounded-2xl p-6 border border-slate-200 dark:border-white/10 shadow-glass backdrop-blur-md space-y-4", children: [
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
      /* @__PURE__ */ jsx("span", { className: `text-xs font-bold px-2 py-0.5 rounded-full ${r.ok ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"}`, children: r.status })
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
  return /* @__PURE__ */ jsxs("div", { className: "bg-slate-900/80 rounded-2xl p-6 border border-slate-200 dark:border-white/10 shadow-glass backdrop-blur-md space-y-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-slate-500 uppercase tracking-widest", children: "For you" }),
      /* @__PURE__ */ jsx("span", { className: "text-xs text-blue-400 font-semibold", children: "4 new" })
    ] }),
    items.map((it) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-white/3 hover:bg-white/6 transition-colors cursor-pointer group", children: [
      /* @__PURE__ */ jsx("div", { className: "w-9 h-9 rounded-lg flex items-center justify-center shrink-0", style: { background: it.c + "18" }, children: /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded", style: { background: it.c } }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-grow min-w-0", children: [
        /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-white truncate", children: it.title }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500", children: [
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
                  className: "inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white/5 border border-slate-200 dark:border-white/10 text-slate-300 rounded-xl font-bold text-base hover:bg-slate-100 dark:hover:bg-white/10 transition-all duration-200 backdrop-blur-sm",
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
    /* @__PURE__ */ jsx("section", { className: "glass-panel border-t border-white/20 border-b border-white/20 dark:border-white/5 relative z-10", children: /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto px-4 py-16 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-slate-300 dark:md:divide-slate-200 dark:divide-white/10", children: [
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
        /* @__PURE__ */ jsx("div", { className: `${!isEven ? "lg:col-start-1 lg:row-start-1" : ""}`, children: /* @__PURE__ */ jsxs("div", { className: "rounded-2xl overflow-hidden glass-card border border-white/30 dark:border-slate-200 dark:border-white/10", children: [
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
                      /* @__PURE__ */ jsxs("span", { className: "text-xs font-black uppercase tracking-widest text-slate-600 border border-white/8 px-2 py-0.5 rounded-full flex items-center gap-1", children: [
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
                      /* @__PURE__ */ jsx("span", { className: "text-xs font-black uppercase tracking-widest text-slate-600 border border-white/8 px-2 py-0.5 rounded-full", children: tool.tag })
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
        STEPS.map((step, i) => /* @__PURE__ */ jsxs("div", { className: "relative flex flex-col items-center text-center group", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative mb-6", children: [
            /* @__PURE__ */ jsx("div", { className: "w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center group-hover:border-blue-200 dark:group-hover:border-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-all duration-300", children: /* @__PURE__ */ jsx("span", { className: "text-2xl font-black text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors", children: step.num }) }),
            i < STEPS.length - 1 && /* @__PURE__ */ jsx("div", { className: "lg:hidden absolute top-1/2 left-full w-8 h-px bg-slate-200 -translate-y-1/2" })
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
                  className: "inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white/5 border border-slate-200 dark:border-white/10 text-slate-300 rounded-xl font-bold text-base hover:bg-slate-100 dark:hover:bg-white/10 transition-all duration-200",
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
function Login() {
  const { login, signup, isAuthenticated, isLoading, error, accountInUse, clearAccountInUse } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: "", password: "", github_username: "" });
  const [localError, setLocalError] = useState("");
  if (isAuthenticated) {
    return /* @__PURE__ */ jsx(Navigate, { to: "/dashboard", replace: true });
  }
  const redirectAfterAuth = (target) => {
    setTimeout(() => {
      window.location.href = target;
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
        redirectAfterAuth("/dashboard");
      } else {
        await signup(formData);
        redirectAfterAuth("/survey");
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
          /* @__PURE__ */ jsx("span", { className: "text-2xl font-extrabold text-white tracking-tighter", children: "JobTune" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-5xl font-extrabold text-white leading-tight", children: [
            "Your journey to ",
            /* @__PURE__ */ jsx("br", {}),
            /* @__PURE__ */ jsx("span", { className: "text-blue-300", children: "FAANG" }),
            " begins here."
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-xl text-slate-300 font-light max-w-md leading-relaxed", children: "One account, one active device — built to keep your preparation personal and secure." })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-6 pt-8", children: [
          { title: "Personalized Skill Gap Analysis", icon: Activity },
          { title: "ATS-Grade Resume Optimization", icon: Layout$1 },
          { title: "Curated Industry Learning Paths", icon: Sparkles }
        ].map((item, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-xl backdrop-blur-sm", children: [
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
        /* @__PURE__ */ jsx("h3", { className: "text-4xl font-extrabold text-slate-900 dark:text-white font-headline tracking-tight", children: isLogin ? "Welcome Back!" : "Create your Account" }),
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
                className: "w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-400 hover:border-slate-300 dark:hover:border-slate-600 transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium",
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
                className: "w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-400 hover:border-slate-300 dark:hover:border-slate-600 transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium",
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
                className: "w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-400 hover:border-slate-300 dark:hover:border-slate-600 transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium",
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
            className: "w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-50",
            children: [
              isLoading ? "Authenticating..." : isLogin ? "Sign In" : "Create Account",
              /* @__PURE__ */ jsx(ArrowRight, { className: "w-5 h-5" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center", children: /* @__PURE__ */ jsx("div", { className: "w-full border-t border-slate-200 dark:border-slate-700" }) }),
        /* @__PURE__ */ jsx("div", { className: "relative flex justify-center text-sm", children: /* @__PURE__ */ jsx("span", { className: "px-4 py-1 bg-white dark:bg-slate-900 rounded-full text-slate-400 dark:text-slate-500 text-xs font-bold", children: "New to the Ecosystem?" }) })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setIsLogin(!isLogin),
          className: "w-full py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-[0.98] shadow-sm",
          children: isLogin ? "Create an Account" : "Return to Login"
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "text-center text-xs text-on-surface-variant font-medium px-8", children: "By joining, you agree to our Terms of Service and single-device session policy." })
    ] }) })
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
    return /* @__PURE__ */ jsx("div", { className: "page-container", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setSelectedPost(null),
          className: "flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-8 font-bold transition",
          children: "← Back to Blog"
        }
      ),
      /* @__PURE__ */ jsxs("article", { className: "card rounded-2xl p-8", children: [
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
      /* @__PURE__ */ jsx("h1", { className: "text-4xl md:text-5xl font-extrabold text-on-surface font-headline mb-4", children: "JobTube Blog" }),
      /* @__PURE__ */ jsx("p", { className: "text-xl text-on-surface-variant font-medium max-w-2xl mx-auto", children: "Career insights, job search strategies, and AI-powered optimization tips for freshers breaking into tech." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid md:grid-cols-2 gap-8", children: Object.values(BlogPost).map((post) => /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: () => setSelectedPost(post.id),
        className: "group cursor-pointer card rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-2 transition-all duration-300",
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
    /* @__PURE__ */ jsxs("div", { className: "mt-20 glass-card border-blue-200/50 rounded-2xl p-8", children: [
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
function SessionBlocked() {
  const { sessionBlockedMessage, clearSessionBlocked, logout } = useAuthStore();
  const handleSignInAgain = async () => {
    clearSessionBlocked();
    await logout();
    window.location.href = "/login";
  };
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md w-full text-center card rounded-2xl p-10 border border-rose-200/50 dark:border-rose-900/40", children: [
    /* @__PURE__ */ jsx("div", { className: "inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-100 dark:bg-rose-900/30 mb-6", children: /* @__PURE__ */ jsx(MonitorOff, { className: "w-10 h-10 text-rose-600 dark:text-rose-400" }) }),
    /* @__PURE__ */ jsx("h1", { className: "text-2xl font-extrabold text-slate-900 dark:text-white mb-3", children: "Session ended" }),
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
const PaymentConfirm = lazy(() => import("./assets/PaymentConfirm-C3G6d2lq.js"));
const PlanSettings = lazy(() => import("./assets/PlanSettings-CRwQRufb.js"));
const SkillAssessment = lazy(() => import("./assets/SkillAssessment-Ckbi0AHe.js"));
const ResumeOptimizer = lazy(() => import("./assets/ResumeOptimizer-BhE4yC8Y.js"));
const Dashboard = lazy(() => import("./assets/Dashboard-tiHeQHDt.js"));
const ContentVault = lazy(() => import("./assets/ContentVault-C_99naKu.js"));
const LinkedInOptimizer = lazy(() => import("./assets/LinkedInOptimizer-BUI8PVFt.js"));
const GitHubOptimizer = lazy(() => import("./assets/GitHubOptimizer-dvc9xfCS.js"));
const PortfolioBuilder = lazy(() => import("./assets/PortfolioBuilder-BlvX1O5S.js"));
const ProjectIdeas = lazy(() => import("./assets/ProjectIdeas-D1F-dFbC.js"));
const MockInterview = lazy(() => import("./assets/MockInterview-DoKOtc4F.js"));
const JobMatcher = lazy(() => import("./assets/JobMatcher-CNv2EdC7.js"));
const JobTracker = lazy(() => import("./assets/JobTracker-B1SpTVVK.js"));
const JobDiscovery = lazy(() => import("./assets/JobDiscovery-BLz9KhBF.js"));
const ResumeBuilder = lazy(() => import("./assets/ResumeBuilder-sQWuIFCI.js"));
const ResumeHistory = lazy(() => import("./assets/ResumeHistory-Cf2rTajN.js"));
const ResumeComparison = lazy(() => import("./assets/ResumeComparison-Dasm4SRI.js"));
const ResumeSend = lazy(() => import("./assets/ResumeSend-CcKoqLUU.js"));
const CareerRoadmap = lazy(() => import("./assets/CareerRoadmap-H_qJK2lS.js"));
const ATSChecker = lazy(() => import("./assets/ATSCheckerV2-DnZhkURn.js"));
const JobAnalyzer = lazy(() => import("./assets/JobAnalyzer-BMSdw9Tu.js"));
const CoverLetterGenerator = lazy(() => import("./assets/CoverLetterGenerator-CiShzaI3.js"));
const EvidenceDashboard = lazy(() => import("./assets/EvidenceDashboard-CENox6GQ.js"));
const JobFitAnalysis = lazy(() => import("./assets/JobFitAnalysis-DHcx8fkv.js"));
const JobPreparation = lazy(() => import("./assets/JobPreparation-DPP7RbFs.js"));
const TuneAndPolishTrack = lazy(() => import("./assets/TuneAndPolishTrack-jA2Jo91d.js"));
const ZeroToHeroTrack = lazy(() => import("./assets/ZeroToHeroTrack-BpMS81pn.js"));
const LearnAndBuildTrack = lazy(() => import("./assets/LearnAndBuildTrack-D-igWyap.js"));
const RecruiterVisibility = lazy(() => import("./assets/RecruiterVisibility-Bidpmvs9.js"));
const ResumeConsistency = lazy(() => import("./assets/ResumeConsistency-CHCmLLAo.js"));
const AchievementEnhancer = lazy(() => import("./assets/AchievementEnhancer-YvbJe35z.js"));
const AITutor = lazy(() => import("./assets/AITutor-DG_o9XV1.js"));
const AIDoubtSolver = lazy(() => import("./assets/AIDoubtSolver-B0ZIG1x4.js"));
const CourseLibrary = lazy(() => import("./assets/CourseLibrary-D8EVLm3d.js"));
const LearningPaths = lazy(() => import("./assets/LearningPaths-BS-WTHU8.js"));
const AINotesGenerator = lazy(() => import("./assets/AINotesGenerator-DoNnSUWf.js"));
const AIFlashcards = lazy(() => import("./assets/AIFlashcards-CCK7Nd7_.js"));
const AIQuizGenerator = lazy(() => import("./assets/AIQuizGenerator-CprNjD2C.js"));
const Community = lazy(() => import("./assets/Community-CwCufQqf.js"));
const CommunicationSkills = lazy(() => import("./assets/CommunicationSkills-D6LtRkC2.js"));
const CodingPractice = lazy(() => import("./assets/CodingPractice-CfeV2OMw.js"));
const Assessments = lazy(() => import("./assets/Assessments-D-sG4_1K.js"));
const AIProjectBuilder = lazy(() => import("./assets/AIProjectBuilder-4xiEADNc.js"));
const ProjectWorkspace = lazy(() => import("./assets/ProjectWorkspace-CZGGPSge.js"));
const AICareerCoach = lazy(() => import("./assets/AICareerCoach-JASMPkZu.js"));
const AICodeReviewer = lazy(() => import("./assets/AICodeReviewer-BFPJOmL3.js"));
const UniversityDashboard = lazy(() => import("./assets/UniversityDashboard-wvMaBEvq.js"));
const FacultyPanel = lazy(() => import("./assets/FacultyPanel-BQh68cdp.js"));
const RecruiterPortal = lazy(() => import("./assets/RecruiterPortal-kfbHkNyL.js"));
const ComingSoon = lazy(() => import("./assets/ComingSoon-hA_0U3tY.js"));
const Survey = lazy(() => import("./assets/Survey-Cn-bM-4w.js"));
const CareerDiscovery = lazy(() => import("./assets/CareerDiscovery-C8vp1GC-.js"));
const CareerPreview = lazy(() => import("./assets/CareerPreview-DmIDBD5O.js"));
const SubscriptionGate = lazy(() => import("./assets/SubscriptionGate-C8u5ssyd.js"));
function OnboardingCheckLoader() {
  return /* @__PURE__ */ jsx("div", { className: "w-full min-h-[60vh] flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
    /* @__PURE__ */ jsx("div", { className: "inline-block w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-3" }),
    /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-sm font-medium", children: "Loading your tools..." })
  ] }) });
}
function ProtectedRoute({ children, requireOnboarding = true }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboardingComplete = useSubscriptionStore((s) => s.onboardingComplete);
  const onboardingChecked = useSubscriptionStore((s) => s.onboardingChecked);
  if (!isAuthenticated) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  if (requireOnboarding && !onboardingChecked) return /* @__PURE__ */ jsx(OnboardingCheckLoader, {});
  if (requireOnboarding && !onboardingComplete) return /* @__PURE__ */ jsx(Navigate, { to: "/survey", replace: true });
  return children;
}
function SurveyRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboardingComplete = useSubscriptionStore((s) => s.onboardingComplete);
  const onboardingChecked = useSubscriptionStore((s) => s.onboardingChecked);
  if (!isAuthenticated) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  if (!onboardingChecked) return /* @__PURE__ */ jsx(OnboardingCheckLoader, {});
  if (onboardingComplete) return /* @__PURE__ */ jsx(Navigate, { to: "/dashboard", replace: true });
  return children;
}
function ProtectedToolRoute({ children, toolPath }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboardingComplete = useSubscriptionStore((s) => s.onboardingComplete);
  const onboardingChecked = useSubscriptionStore((s) => s.onboardingChecked);
  if (!isAuthenticated) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  if (!onboardingChecked) return /* @__PURE__ */ jsx(OnboardingCheckLoader, {});
  if (!onboardingComplete) return /* @__PURE__ */ jsx(Navigate, { to: "/survey", replace: true });
  const toolName = getToolForRoute(toolPath);
  if (!toolName) return children;
  const requiredPlan = getRequiredPlan(toolName);
  return /* @__PURE__ */ jsx(PlanGate, { toolName, requiredPlan, children });
}
function AppLoader() {
  return /* @__PURE__ */ jsx("div", { className: "min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
    /* @__PURE__ */ jsx("div", { className: "inline-block w-10 h-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-4" }),
    /* @__PURE__ */ jsx("p", { className: "text-slate-600 font-semibold", children: "Loading..." })
  ] }) });
}
function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isLoading = useAuthStore((s) => s.isLoading);
  const sessionBlocked = useAuthStore((s) => s.sessionBlocked);
  const checkOnboarded = useSubscriptionStore((s) => s.checkOnboarded);
  const getUserPlan = useSubscriptionStore((s) => s.getUserPlan);
  useEffect(() => {
    if (!isBrowser) return;
    checkAuth().then(() => {
      const isAuthed = useAuthStore.getState().isAuthenticated;
      if (!isAuthed) return;
      checkOnboarded();
      getUserPlan();
    });
  }, []);
  if (sessionBlocked) return /* @__PURE__ */ jsx(SessionBlocked, {});
  if (isBrowser && isLoading) return /* @__PURE__ */ jsx(AppLoader, {});
  return /* @__PURE__ */ jsx(ErrorBoundary, { children: /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(AppLoader, {}), children: /* @__PURE__ */ jsxs(Routes, { children: [
    /* @__PURE__ */ jsxs(Route, { path: "/", element: /* @__PURE__ */ jsx(Layout, {}), children: [
      /* @__PURE__ */ jsx(Route, { index: true, element: /* @__PURE__ */ jsx(Home, {}) }),
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
      /* @__PURE__ */ jsx(Route, { path: "dashboard", element: /* @__PURE__ */ jsx(ProtectedRoute, { children: /* @__PURE__ */ jsx(Dashboard, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "dashboard/settings/plans", element: /* @__PURE__ */ jsx(ProtectedRoute, { requireOnboarding: false, children: /* @__PURE__ */ jsx(PlanSettings, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "interview", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/interview", children: /* @__PURE__ */ jsx(MockInterview, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "jobmatch", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/jobmatch", children: /* @__PURE__ */ jsx(JobMatcher, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "discover", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/discover", children: /* @__PURE__ */ jsx(JobDiscovery, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "jobs", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/jobs", children: /* @__PURE__ */ jsx(JobTracker, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "career", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/career", children: /* @__PURE__ */ jsx(CareerRoadmap, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "job-analyzer", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/job-analyzer", children: /* @__PURE__ */ jsx(JobAnalyzer, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "ats-checker", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/ats-checker", children: /* @__PURE__ */ jsx(ATSChecker, {}) }) }),
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
      /* @__PURE__ */ jsx(Route, { path: "ai-tutor", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/ai-tutor", children: /* @__PURE__ */ jsx(AITutor, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "doubt-solver", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/doubt-solver", children: /* @__PURE__ */ jsx(AIDoubtSolver, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "courses", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/courses", children: /* @__PURE__ */ jsx(CourseLibrary, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "learning-paths", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/learning-paths", children: /* @__PURE__ */ jsx(LearningPaths, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "notes", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/notes", children: /* @__PURE__ */ jsx(AINotesGenerator, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "flashcards", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/flashcards", children: /* @__PURE__ */ jsx(AIFlashcards, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "quiz", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/quiz", children: /* @__PURE__ */ jsx(AIQuizGenerator, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "community", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/community", children: /* @__PURE__ */ jsx(Community, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "communication-skills", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/communication-skills", children: /* @__PURE__ */ jsx(CommunicationSkills, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "coding-practice", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/coding-practice", children: /* @__PURE__ */ jsx(CodingPractice, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "assessments", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/assessments", children: /* @__PURE__ */ jsx(Assessments, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "project-builder", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/project-builder", children: /* @__PURE__ */ jsx(AIProjectBuilder, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "project-workspace", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/project-workspace", children: /* @__PURE__ */ jsx(ProjectWorkspace, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "career-coach", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/career-coach", children: /* @__PURE__ */ jsx(AICareerCoach, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "code-reviewer", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/code-reviewer", children: /* @__PURE__ */ jsx(AICodeReviewer, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "university-dashboard", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/university-dashboard", children: /* @__PURE__ */ jsx(UniversityDashboard, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "faculty-panel", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/faculty-panel", children: /* @__PURE__ */ jsx(FacultyPanel, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "recruiter-portal", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/recruiter-portal", children: /* @__PURE__ */ jsx(RecruiterPortal, {}) }) }),
      /* @__PURE__ */ jsx(Route, { path: "career-readiness", element: /* @__PURE__ */ jsx(ProtectedToolRoute, { toolPath: "/career-readiness", children: /* @__PURE__ */ jsx(ComingSoon, { toolName: "Career Readiness Dashboard", description: "A unified career score with progress tracking and improvement recommendations across your whole journey. Launching soon." }) }) })
    ] }),
    /* @__PURE__ */ jsx(Route, { path: "/login", element: /* @__PURE__ */ jsx(Login, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/survey", element: /* @__PURE__ */ jsx(SurveyRoute, { children: /* @__PURE__ */ jsx(Survey, {}) }) }),
    /* @__PURE__ */ jsx(Route, { path: "/career-discovery", element: /* @__PURE__ */ jsx(SurveyRoute, { children: /* @__PURE__ */ jsx(CareerDiscovery, {}) }) }),
    /* @__PURE__ */ jsx(Route, { path: "/career-preview", element: /* @__PURE__ */ jsx(SurveyRoute, { children: /* @__PURE__ */ jsx(CareerPreview, {}) }) }),
    /* @__PURE__ */ jsx(Route, { path: "/subscription-gate", element: /* @__PURE__ */ jsx(SurveyRoute, { children: /* @__PURE__ */ jsx(SubscriptionGate, {}) }) })
  ] }) }) });
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
    // SSR never has a token; no auth check needed
    error: null,
    hasCompletedOnboarding: false,
    sessionBlocked: false,
    sessionBlockedMessage: null,
    accountInUse: null
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
  Link as L,
  PLAN_META as P,
  getFeatureDiff as a,
  useSubscriptionStore as b,
  buildHeadTags,
  api as c,
  formatPrice as f,
  getChangeType as g,
  getRenderStrategy,
  normalizePathname,
  render,
  useAuthStore as u
};
