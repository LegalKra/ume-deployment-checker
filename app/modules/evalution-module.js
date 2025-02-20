const {readNodeSizeConfiguration} = require("./configuration-reader-module");

const deepEqual = (x, y) => {
    return (x && y && typeof x === 'object' && typeof y === 'object') ? 
      (Object.keys(x).length === Object.keys(y).length) && Object.keys(x).reduce((isEqual, key) => {return isEqual && deepEqual(x[key], y[key]);}, true) :
      (x === y);
};

const subAppSelectorFunction = (pod, subApp) => pod?.metadata?.annotations?.APP_PACK_URL_PATH === subApp;

const getSubApp = (pods, subApp) => {
    return pods.find(pod => subAppSelectorFunction(pod, subApp));
};

const getSubAppCount = (pods, subApp) => {
    return pods.filter(pod => subAppSelectorFunction(pod, subApp)).length;
};

const getSubAppNodeSelectors = (pods, subApp) => {
    return getSubApp(pods, subApp)?.spec?.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms[0]?.matchExpressions;
};

const evaluateDeployment = (pods, subApp, subAppConfig) => {
    let result = [];
    let status = getSubApp(pods, subApp)?.status?.phase;
    let found = getSubAppCount(pods, subApp);

    if(found === 0 || found !== subAppConfig.count || status !== "Running") {
        result.push(`Status (Expected/Current): Running/${status}, Count (Expected/Current): ${subAppConfig.count}/${found}.`);
    }
    return result.join(" ");
};

const evaluateNodeSelector = (pods, subApp, subAppConfig) => {
    let result = [];
    subAppConfig.nodeSelectors?.forEach(expectedSelector => {
        let foundSelector = getSubAppNodeSelectors(pods, subApp)?.find(podSelector => expectedSelector.key === podSelector.key);
        if (!foundSelector || !deepEqual(expectedSelector, foundSelector)) {
            result.push(`Node selector ${expectedSelector.key}=${expectedSelector.values[0]} missing.`);
        }
    });
    return result.join(" ");
};

const evaluateVersion = (pods, subApp) => {
    return getSubApp(pods, subApp)?.metadata?.annotations?.UU_CLOUD_APP_VERSION;
};

const evaluateRts = (pods, subApp) => {
    return getSubApp(pods, subApp)?.metadata?.annotations?.UU_CLOUD_RUNTIME_STACK_CODE;
};

const evaluateDeploymentUri = (pods, subApp) => {
    return getSubApp(pods, subApp)?.metadata?.annotations?.UU_CLOUD_APP_DEPLOYMENT_URI;
};

const evaluateNodeSize = (pods, subApp, subAppConfig, nodeSizes) => {
    let result = [];
    let subAppCpu = evaluateCpu(pods, subApp);
    let subAppMemory = evaluateMemory(pods, subApp);
    let foundNodeSizeKey = Object.keys(nodeSizes).find(nodeSizeName => {
        return nodeSizes[nodeSizeName]?.cpu === subAppCpu && nodeSizes[nodeSizeName]?.memory === subAppMemory
    });
    let foundNodeSize = nodeSizes[foundNodeSizeKey];
    if (foundNodeSizeKey !== subAppConfig.nodeSize) {
        result.push(`NodeSize (Expected/Found): ${subAppConfig.nodeSize}/${foundNodeSizeKey}, CPU (Expected/Current): ${foundNodeSize?.cpu}/${subAppCpu}, RAM: ${foundNodeSize?.memory}/${subAppMemory}`)
    } else {
        result.push(`${foundNodeSizeKey} - OK`);
    }
    return result.join(" ");
};

const evaluateCpu = (pods, subApp) => {
    return getSubApp(pods, subApp)?.spec?.containers[0]?.resources?.requests?.cpu;
};

const evaluateMemory = (pods, subApp) => {
    return getSubApp(pods, subApp)?.spec?.containers[0]?.resources?.requests?.memory;
};

const evaluateContainerStatus = (pods, subApp) => {
    const status = getSubApp(pods, subApp)?.status;
    const containerStatus = status?.containerStatuses[0];
    return `${status?.phase} [${status?.startTime}] - Restarts: ${containerStatus?.restartCount}`;
};

const evaluatePodMetadata = (pods, environmentConfiguration, cmdArgs) => {
    const EVALUATE_KEY_DEPLOYMENT = "DEPLOYMENT";
    const EVALUATE_KEY_NODE_SELECTOR = "NODE_SELECTOR";
    const EVALUATE_KEY_VERSION = "VERSION";
    const EVALUATE_KEY_RTS = "RUNTIME_STACK";
    const EVALUATE_KEY_DEPLOYMENT_URI = "UUAPP_DEPLOYMENT_URI";
    const EVALUATE_KEY_NODE_SIZE = "NODE_SIZE";
    const EVALUATE_KEY_MEMORY = "MEMORY";
    const EVALUATE_KEY_CPU = "CPU";
    const EVALUATE_CONTAINER_STATUS = "CONTAINER_STATUS";

    const result = [];
    Object.keys(environmentConfiguration).forEach(subApp => {
        let subAppConfig = environmentConfiguration[subApp];
        if(subAppConfig.required) {
            let evaluateSubApp = {subApp};
            if (cmdArgs.deployment) {
                evaluateSubApp[EVALUATE_KEY_DEPLOYMENT] = evaluateDeployment(pods, subApp, subAppConfig);
                evaluateSubApp[EVALUATE_KEY_NODE_SELECTOR] = evaluateNodeSelector(pods, subApp, subAppConfig);
            }
            if (cmdArgs.version) {
                evaluateSubApp[EVALUATE_KEY_VERSION] = evaluateVersion(pods, subApp);
            }
            if (cmdArgs.rts) {
                evaluateSubApp[EVALUATE_KEY_RTS] = evaluateRts(pods, subApp);
            }
            if (cmdArgs.uri) {
                evaluateSubApp[EVALUATE_KEY_DEPLOYMENT_URI] = evaluateDeploymentUri(pods, subApp);
            }
            if (cmdArgs.nodesize) {
                let nodesizes = readNodeSizeConfiguration(cmdArgs);
                evaluateSubApp[EVALUATE_KEY_NODE_SIZE] = evaluateNodeSize(pods, subApp, subAppConfig, nodesizes);
            }
            if (cmdArgs.cpu) {
                evaluateSubApp[EVALUATE_KEY_CPU] = evaluateCpu(pods, subApp);
            }
            if (cmdArgs.memory) {
                evaluateSubApp[EVALUATE_KEY_MEMORY] = evaluateMemory(pods, subApp);
            }
            if (cmdArgs.status) {
                evaluateSubApp[EVALUATE_CONTAINER_STATUS] = evaluateContainerStatus(pods, subApp);
            }
            result.push(evaluateSubApp);
        }
    });
    return result;
}

module.exports = {
    evaluatePodMetadata
};