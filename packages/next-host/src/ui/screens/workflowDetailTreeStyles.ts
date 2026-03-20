export const WORKFLOW_DETAIL_TREE_STYLES = `
  @keyframes codemationSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .codemation-execution-tree,
  .codemation-json-tree {
    background: transparent;
    border: none;
    font-family: inherit;
  }

  .codemation-execution-tree .rc-tree-node-content-wrapper,
  .codemation-json-tree .rc-tree-node-content-wrapper {
    display: inline-block;
    width: calc(100% - 18px);
    height: auto;
    padding: 0;
    line-height: 1.2;
    vertical-align: top;
  }

  .codemation-execution-tree .rc-tree-switcher,
  .codemation-json-tree .rc-tree-switcher {
    width: 12px;
    margin-right: 6px;
  }

  .codemation-execution-tree .rc-tree-treenode,
  .codemation-json-tree .rc-tree-treenode {
    padding: 0 0 4px;
    line-height: normal;
  }

  .codemation-execution-tree .rc-tree-treenode {
    white-space: nowrap;
  }

  .codemation-json-tree .rc-tree-treenode {
    white-space: normal;
  }

  .codemation-execution-tree .rc-tree-title,
  .codemation-json-tree .rc-tree-title {
    display: block;
    width: 100%;
  }

  .codemation-execution-tree .rc-tree-treenode ul,
  .codemation-json-tree .rc-tree-treenode ul {
    padding-left: 20px;
  }

  .codemation-execution-tree .rc-tree-node-selected {
    background: transparent;
    box-shadow: none;
    opacity: 1;
  }

  .codemation-execution-tree .rc-tree-node-content-wrapper:hover,
  .codemation-json-tree .rc-tree-node-content-wrapper:hover {
    background: transparent;
  }
`;
