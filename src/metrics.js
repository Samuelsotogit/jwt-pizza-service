const config = require("./config");
const os = require("os");

// Requests variables
const requestCounts = {};
const requestLatency = {};
let totalRequests = 0;
// Active Users variables
const activeUsers = {};
// Authentication variables
let authSuccessCount = 0;
let authFailureCount = 0;
// Pizza variables
let pizzaSoldCount = 0;
let pizzaRevenue = 0;
let pizzaFailures = 0;
let pizzaLatencySum = 0;
let pizzaLatencyCount = 0;

//Track Pizza Related Metrics
function recordPizzaSale(order) {
  const pizzasSold = order.items.length;
  const totalRevenue = order.items.reduce((sum, item) => sum + item.price, 0);

  pizzaSoldCount += pizzasSold;
  pizzaRevenue += totalRevenue;
}

function recordPizzaFailure() {
  pizzaFailures++;
}

function recordPizzaLatency(latencyMs) {
  pizzaLatencySum += latencyMs;
  pizzaLatencyCount++;
}

// --- Track system metrics ---
function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return parseFloat(((usedMemory / totalMemory) * 100).toFixed(2));
}

function getCpuUsagePercentage() {
  const cpus1 = os.cpus();

  return new Promise((resolve) => {
    setTimeout(() => {
      const cpus2 = os.cpus();
      let idleDiff = 0;
      let totalDiff = 0;

      for (let i = 0; i < cpus1.length; i++) {
        const cpu1 = cpus1[i].times;
        const cpu2 = cpus2[i].times;

        const idle = cpu2.idle - cpu1.idle;
        const total =
          cpu2.user +
          cpu2.nice +
          cpu2.sys +
          cpu2.irq +
          cpu2.idle -
          (cpu1.user + cpu1.nice + cpu1.sys + cpu1.irq + cpu1.idle);

        idleDiff += idle;
        totalDiff += total;
      }

      const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
      resolve(parseFloat(usage.toFixed(2)));
    }, 100); // 100ms sample interval
  });
}

// --- Track auth attempts ---
function incrementSuccessfulAuth() {
  authSuccessCount++;
}

function incrementFailedAuth() {
  authFailureCount++;
}

// --- Middleware to track HTTP requests ---
function requestTracker(req, res, next) {
  const method = req.method;
  const start = process.hrtime();

  totalRequests++;
  requestCounts[method] = (requestCounts[method] || 0) + 1;

  res.on("finish", () => {
    const diff = process.hrtime(start);
    const latencyMs = diff[0] * 1000 + diff[1] / 1e6;
    requestLatency[method] = (requestLatency[method] || 0) + latencyMs;
  });

  next();
}

// --- Middleware to track active users ---
function activeUserTracker(req, res, next) {
  if (req.user && req.user.id) {
    activeUsers[req.user.id] = Date.now();
  }
  next();
}

function getActiveUserCount() {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;

  return Object.values(activeUsers).filter(
    (lastSeen) => now - lastSeen <= FIVE_MINUTES
  ).length;
}

// --- Send metric helper ---
function sendMetricToGrafana(
  metricName,
  metricValue,
  type,
  unit,
  attributes = {}
) {
  attributes = { ...attributes, source: config.metrics.source };
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit,
                [type]: {
                  dataPoints: [
                    {
                      asDouble: metricValue,
                      timeUnixNano: Date.now() * 1e6,
                      attributes: Object.entries(attributes).map(
                        ([key, value]) => ({
                          key,
                          value: { stringValue: value.toString() },
                        })
                      ),
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === "sum") {
    const m = metric.resourceMetrics[0].scopeMetrics[0].metrics[0];
    m[type].aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";
    m[type].isMonotonic = true;
  }

  fetch(config.metrics.url, {
    method: "POST",
    body: JSON.stringify(metric),
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  }).catch((err) => console.error("Error pushing metrics:", err));
}

// --- Periodically push metrics ---
setInterval(() => {
  // console.log("Pushing metrics to Grafana...");
  // console.log(`🍕 Pizzas sold so far: ${pizzaSoldCount}`);
  // console.log(`💵 Total revenue so far: $${pizzaRevenue.toFixed(2)}`);
  // console.log(`⚠️ Pizza creation failures: ${pizzaFailures}`);

  // Active users
  sendMetricToGrafana(
    "active_users_last_5min",
    getActiveUserCount(),
    "gauge",
    "users"
  );

  // Requests
  sendMetricToGrafana("http_requests_total", totalRequests, "sum", "1");
  Object.entries(requestCounts).forEach(([method, count]) => {
    sendMetricToGrafana("http_requests_by_method_total", count, "sum", "1", {
      method,
    });
  });
  Object.entries(requestLatency).forEach(([method, totalLatency]) => {
    const avgLatency = totalLatency / requestCounts[method];
    sendMetricToGrafana("http_avg_latency_ms", avgLatency, "gauge", "ms", {
      method,
    });
  });

  // Auth metrics
  sendMetricToGrafana("auth_success_total", authSuccessCount, "sum", "1");
  sendMetricToGrafana("auth_failure_total", authFailureCount, "sum", "1");

  // System metrics
  const cpuPercent = getCpuUsagePercentage();
  sendMetricToGrafana("cpu_usage_percent", cpuPercent, "gauge", "%");
  sendMetricToGrafana(
    "memory_usage_percent",
    getMemoryUsagePercentage(),
    "gauge",
    "%"
  );

  // Send Pizza Metrics
  if (pizzaLatencyCount > 0) {
    const avgLatency = pizzaLatencySum / pizzaLatencyCount;
    sendMetricToGrafana("pizza_creation_latency_ms", avgLatency, "gauge", "ms");
    pizzaLatencySum = 0;
    pizzaLatencyCount = 0;
  }

  sendMetricToGrafana("pizzas_sold_total", pizzaSoldCount, "sum", "1");
  sendMetricToGrafana(
    "pizza_revenue_total",
    pizzaRevenue * 100,
    "gauge",
    "USD"
  );
  sendMetricToGrafana("pizza_creation_failures", pizzaFailures, "sum", "1");
}, 1000); // every 1 second

module.exports = {
  requestTracker,
  activeUserTracker,
  incrementSuccessfulAuth,
  incrementFailedAuth,
  recordPizzaFailure,
  recordPizzaLatency,
  recordPizzaSale,
};
