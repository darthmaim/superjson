import { stringifyPath, parsePath } from './pathstringifier';
import { isUndefined, isNull, isArray, isPlainObject } from './is';
import { forEach, every, find } from 'lodash';

function startsWith(prefix: string, v: string) {
  if (prefix.length > v.length) {
    return false;
  }

  for (let i = 0; i < prefix.length; i++) {
    if (v[i] !== prefix[i]) {
      return false;
    }
  }

  return true;
}

export type Tree<T> = InnerNode<T> | Leaf<T>;
type Leaf<T> = [T];
type InnerNode<T> = [T, Record<string, Tree<T>>];

export function isTree<T>(
  v: any,
  valueChecker: (nodeValue: T) => boolean
): v is Tree<T> {
  if (!isArray(v)) {
    return false;
  }

  if (v.length === 1) {
    return valueChecker(v[0]);
  } else if (v.length === 2) {
    return valueChecker(v[0]) && every(v[1], v => isTree(v, valueChecker));
  }

  return false;
}

export module PathTree {
  export function create<T>(value: T): Tree<T> {
    return [value];
  }

  export function get<T>(
    tree: Tree<T>,
    path: string[]
  ): [T, true] | [null, false] {
    if (path.length === 0) {
      return [tree[0] as T, true];
    }

    if (tree.length === 1) {
      return [null, false];
    } else {
      const [head, ...tail] = path;
      const [, children] = tree;
      return get(children[head], tail);
    }
  }

  /**
   * @description Optimised for adding new leaves. Does not support adding inner nodes.
   */
  export function append<T>(tree: Tree<T>, path: string[], value: T) {
    if (path.length === 0) {
      tree[0] = value;
      return;
    }

    if (tree.length === 1) {
      ((tree as any) as InnerNode<T>)[1] = { [stringifyPath(path)]: [value] };
    } else {
      const [, children] = tree;
      const availablePaths = Object.keys(children);

      const stringifiedPath = stringifyPath(path);

      // due to the constraints mentioned in the functions description,
      // there may be prefixes of `path` already set, but no extensions of it.
      // If there's such a prefix, we'll find it.
      const prefix = find(availablePaths, candidate =>
        startsWith(candidate + '.', stringifiedPath)
      );

      if (isUndefined(prefix)) {
        tree[1][stringifyPath(path)] = [value];
      } else {
        const pathWithoutPrefix = path.slice(parsePath(prefix).length);
        append(children[prefix], pathWithoutPrefix, value);
      }
    }
  }

  export function appendPath(tree: Tree<string | null>, path: string[]) {
    const front = path.slice(0, path.length - 1);
    const last = path[path.length - 1];
    append(tree, front, last);
  }

  /**
   * Depth-first post-order traversal.
   */
  export function traverse<T>(
    tree: Tree<T>,
    walker: (v: T, path: string[]) => void,
    origin: string[] = []
  ): void {
    if (tree.length === 1) {
      const [nodeValue] = tree;
      walker(nodeValue, origin);
    } else {
      const [nodeValue, children] = tree;

      forEach(children, (child, key) => {
        traverse(child, walker, [...origin, ...parsePath(key)]);
      });

      walker(nodeValue, origin);
    }
  }

  export function traverseWhileIgnoringNullRoot<T>(
    tree: Tree<T | null>,
    walker: (v: T, path: string[]) => void
  ): void {
    traverse(tree, (v, path) => {
      if (isNull(v)) {
        if (path.length === 0) {
          return;
        }

        throw new Error('Illegal State');
      }

      walker(v, path);
    });
  }

  export function traversePaths(
    tree: Tree<string | null>,
    walker: (path: string[]) => void
  ) {
    traverseWhileIgnoringNullRoot(tree, (last, front) =>
      walker([...front, last])
    );
  }

  export type CollapsedRootTree<T> =
    | Tree<T>
    | Record<string, Tree<T>>
    | undefined;

  export function isMinimizedTree<T>(
    v: any,
    valueChecker: (v: T) => boolean
  ): v is CollapsedRootTree<T> {
    if (isUndefined(v)) {
      return true;
    }

    if (isPlainObject(v)) {
      return every(v, v => isTree(v, valueChecker));
    }

    return isTree(v, valueChecker);
  }

  /**
   * @description Minimizes trees that start with a `null`-root
   */
  export function collapseRoot<T>(tree: Tree<T | null>): CollapsedRootTree<T> {
    if (isNull(tree[0])) {
      if (tree.length === 1) {
        return undefined;
      } else {
        return tree[1] as Record<string, Tree<T>>;
      }
    }

    return tree as Tree<T>;
  }

  export function expandRoot<T>(tree: CollapsedRootTree<T>): Tree<T | null> {
    if (isArray(tree)) {
      return tree;
    }

    if (isUndefined(tree)) {
      return [null];
    }

    return [null, tree];
  }
}
