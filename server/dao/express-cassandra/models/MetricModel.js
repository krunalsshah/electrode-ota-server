module.exports = ({
    fields: {
        id: {
            type: "timeuuid",
            default: {"$db_function": "now()"}
        },
        deploymentkey: "text",
        appversion: "text",
        clientuniqueid: "text",
        label: "text",
        previousdeploymentkey: "text",
        previouslabelorappversion: "text",
        status: "text"
    },
    key: [["id"], "deploymentkey"],
    indexes: ["deploymentkey"],
    clustering_order: {
        deploymentkey: "asc"
    },
    table_name: "metrics"
})
