require('./log');

const defaultConfig = {
    showLevel: true,
    associatedWithSummary: true,
    printLog: false,  
    multipleH1: true, 
    mode: "float",
    float: { 
        showLevelIcon: false, 
        level1Icon: "fa fa-hand-o-right",
        level2Icon: "fa fa-hand-o-right",
        level3Icon: "fa fa-hand-o-right"
    },
    pageTop: {
        showLevelIcon: false,  
        level1Icon: "fa fa-hand-o-right",
        level2Icon: "fa fa-hand-o-right",
        level3Icon: "fa fa-hand-o-right"
    },
    
    themeDefault: {
        showLevel: false
    }
}

function handler(defaultConfig, config) {
    if (config) {
        for (var item in defaultConfig) {
            if (item in config) {
                defaultConfig[item] = config[item];
            }
        }
    }
}

function handlerAll(bookIns) {
    var config = bookIns.config.get('pluginsConfig')['ancre-navigation'];
    var themeDefaultConfig = bookIns.config.get('pluginsConfig')['theme-default'];
    handler(defaultConfig, config);
    handler(defaultConfig.themeDefault, themeDefaultConfig);

    if (config.isRewritePageTitle) {
        console.error("error:".error +
            "plugins[anchor-navigation-ex]：isRewritePageTitle，" +
            "https://github.com/zq99299/gitbook-plugin-anchor-navigation");
        console.log("");
        console.error("error:".error +
            "Please check here https://github.com/zq99299/gitbook-plugin-anchor-navigation  for the latest version of the configuration item");
    }
}

module.exports = {
    config: defaultConfig,
    handler: handler,
    handlerAll: handlerAll
}
