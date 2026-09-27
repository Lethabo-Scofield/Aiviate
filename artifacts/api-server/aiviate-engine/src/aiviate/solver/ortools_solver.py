"""OR-Tools CVRPTW solver.

Objective (all weights org-configurable via ObjectiveWeights):
  arc cost        = travel-minute weight + travel-km weight
  vehicle cost    = fixed operating cost per used vehicle
  late penalty    = soft upper bound at window end (priority-weighted),
                    hard bound at window end + allowed lateness
  unassigned      = disjunction penalty (priority-weighted)
  overtime        = soft upper bound at shift end, hard at shift end + max overtime
  imbalance       = global span coefficient on the time dimension
  reassignment    = handled by seeding the previous plan as the initial
                    solution and counting deviations (reported in the output;
                    see README "Known limitations" for the soft-constraint
                    upgrade path)

Hard constraints: capacities (weight, volume), vehicle/driver shift bounds,
time-window hard bounds, one vehicle per node, locked vehicles for
re-optimisation. Nodes for completed stops are never given to the solver.
"""

from __future__ import annotations

import time

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from aiviate.domain.enums import SolverStatus
from aiviate.observability import get_logger, log_ctx, metrics
from aiviate.solver.model import (
    COST_SCALE,
    SolverInput,
    SolverOutput,
    StopEstimate,
    VehicleRoute,
)

logger = get_logger(__name__)

_STATUS_MAP = {
    0: SolverStatus.ERROR,  # ROUTING_NOT_SOLVED
    1: SolverStatus.OPTIMAL,  # ROUTING_SUCCESS
    2: SolverStatus.FEASIBLE,  # ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED
    3: SolverStatus.INFEASIBLE,  # ROUTING_FAIL
    4: SolverStatus.TIMEOUT,  # ROUTING_FAIL_TIMEOUT
    5: SolverStatus.ERROR,  # ROUTING_INVALID
}


def solve(problem: SolverInput) -> SolverOutput:
    if not problem.vehicles:
        return SolverOutput(status=SolverStatus.INFEASIBLE, error="no eligible vehicles",
                            dropped_order_ids=[o.order_id for o in problem.orders])
    if not problem.orders:
        return SolverOutput(status=SolverStatus.OPTIMAL)

    started = time.perf_counter()
    try:
        output = _solve_inner(problem)
    except Exception as exc:  # never hide solver failures
        logger.exception("solver crashed")
        metrics.increment("solver.errors")
        return SolverOutput(status=SolverStatus.ERROR, error=str(exc),
                            dropped_order_ids=[o.order_id for o in problem.orders])
    output.solver_wall_time_s = round(time.perf_counter() - started, 3)
    metrics.observe("solver.seconds", output.solver_wall_time_s)
    metrics.increment(f"solver.status.{output.status}")
    if output.dropped_order_ids:
        metrics.increment("solver.unassigned_orders", len(output.dropped_order_ids))
    logger.info(
        "solver finished",
        extra=log_ctx(status=output.status, routes=len(output.routes),
                      dropped=len(output.dropped_order_ids), seconds=output.solver_wall_time_s),
    )
    return output


def _solve_inner(problem: SolverInput) -> SolverOutput:
    n_orders = len(problem.orders)
    n_vehicles = len(problem.vehicles)
    weights = problem.weights

    # Solver node space: nodes 0..n_orders-1 are orders; vehicle start/end
    # nodes are appended per OR-Tools' multi-depot convention.
    starts = [n_orders + 2 * v for v in range(n_vehicles)]
    ends = [n_orders + 2 * v + 1 for v in range(n_vehicles)]
    n_nodes = n_orders + 2 * n_vehicles

    def node_point(node: int) -> int:
        if node < n_orders:
            return problem.orders[node].point
        vehicle, offset = divmod(node - n_orders, 2)
        spec = problem.vehicles[vehicle]
        return spec.start_point if offset == 0 else spec.end_point

    manager = pywrapcp.RoutingIndexManager(n_nodes, n_vehicles, starts, ends)
    routing = pywrapcp.RoutingModel(manager)
    matrix = problem.matrix

    def arc_cost(from_index: int, to_index: int) -> int:
        i = node_point(manager.IndexToNode(from_index))
        j = node_point(manager.IndexToNode(to_index))
        minutes = matrix.duration_s(i, j) / 60.0
        km = matrix.distance_m(i, j) / 1000.0
        return round((minutes * weights.travel_minute_cost + km * weights.travel_km_cost) * COST_SCALE)

    routing.SetArcCostEvaluatorOfAllVehicles(routing.RegisterTransitCallback(arc_cost))

    for v in range(n_vehicles):
        routing.SetFixedCostOfVehicle(round(weights.vehicle_operating_cost * COST_SCALE), v)

    # Time dimension: travel + service time of the departure node.
    horizon = max(spec.shift_end_s + spec.max_overtime_s for spec in problem.vehicles)
    horizon = max(horizon, max((o.window_end_s + o.allowed_late_s for o in problem.orders), default=0))

    def transit_time(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        i = node_point(from_node)
        j = node_point(manager.IndexToNode(to_index))
        service = problem.orders[from_node].service_time_s if from_node < n_orders else 0
        return round(matrix.duration_s(i, j)) + service

    time_cb = routing.RegisterTransitCallback(transit_time)
    routing.AddDimension(time_cb, horizon, horizon, False, "Time")
    time_dim = routing.GetDimensionOrDie("Time")
    if weights.route_imbalance_coefficient > 0:
        time_dim.SetGlobalSpanCostCoefficient(round(weights.route_imbalance_coefficient * COST_SCALE))

    for node, order in enumerate(problem.orders):
        index = manager.NodeToIndex(node)
        hard_end = order.window_end_s + order.allowed_late_s
        time_dim.CumulVar(index).SetRange(order.window_start_s, hard_end)
        multiplier = weights.priority_multiplier(order.priority)
        if order.allowed_late_s > 0:
            time_dim.SetCumulVarSoftUpperBound(
                index,
                order.window_end_s,
                round(weights.late_delivery_penalty_per_minute * multiplier * COST_SCALE / 60),
            )
        routing.AddDisjunction(
            [index], round(weights.unassigned_order_penalty * multiplier * COST_SCALE)
        )
        if order.allowed_vehicles is not None:
            # -1 stays allowed: the node may still be dropped (paying its
            # disjunction penalty) instead of making the model infeasible.
            routing.VehicleVar(index).SetValues([-1, *order.allowed_vehicles])

    for v, spec in enumerate(problem.vehicles):
        time_dim.CumulVar(routing.Start(v)).SetMin(spec.shift_start_s)
        time_dim.CumulVar(routing.End(v)).SetMax(spec.shift_end_s + spec.max_overtime_s)
        if spec.max_overtime_s > 0:
            time_dim.SetCumulVarSoftUpperBound(
                routing.End(v),
                spec.shift_end_s,
                round(weights.overtime_penalty_per_minute * COST_SCALE / 60),
            )

    def weight_demand(from_index: int) -> int:
        node = manager.IndexToNode(from_index)
        return problem.orders[node].weight_g if node < n_orders else 0

    def volume_demand(from_index: int) -> int:
        node = manager.IndexToNode(from_index)
        return problem.orders[node].volume_ml if node < n_orders else 0

    routing.AddDimensionWithVehicleCapacity(
        routing.RegisterUnaryTransitCallback(weight_demand),
        0,
        [spec.weight_capacity_g for spec in problem.vehicles],
        True,
        "Weight",
    )
    routing.AddDimensionWithVehicleCapacity(
        routing.RegisterUnaryTransitCallback(volume_demand),
        0,
        [spec.volume_capacity_ml for spec in problem.vehicles],
        True,
        "Volume",
    )

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.FromSeconds(problem.time_limit_seconds)
    params.log_search = False

    assignment = None
    if problem.initial_routes:
        routing.CloseModelWithParameters(params)
        initial = routing.ReadAssignmentFromRoutes(problem.initial_routes, True)
        if initial is not None:
            assignment = routing.SolveFromAssignmentWithParameters(initial, params)
    if assignment is None:
        assignment = routing.SolveWithParameters(params)

    status = _STATUS_MAP.get(routing.status(), SolverStatus.ERROR)
    if assignment is None:
        return SolverOutput(
            status=status if status != SolverStatus.OPTIMAL else SolverStatus.INFEASIBLE,
            dropped_order_ids=[o.order_id for o in problem.orders],
            error="no solution found",
        )

    return _extract(problem, manager, routing, time_dim, assignment, status, node_point)


def _extract(problem, manager, routing, time_dim, assignment, status, node_point) -> SolverOutput:
    n_orders = len(problem.orders)
    matrix = problem.matrix
    routes: list[VehicleRoute] = []
    assigned: set[str] = set()
    reassigned: list[str] = []
    previous = problem.previous_assignment or {}

    for v, spec in enumerate(problem.vehicles):
        route = VehicleRoute(vehicle_index=v, driver_id=spec.driver_id, vehicle_id=spec.vehicle_id)
        index = routing.Start(v)
        start_time = assignment.Value(time_dim.CumulVar(index))
        previous_point = node_point(manager.IndexToNode(index))
        while not routing.IsEnd(index):
            next_index = assignment.Value(routing.NextVar(index))
            node = manager.IndexToNode(next_index)
            if node < n_orders:
                order = problem.orders[node]
                arrival = assignment.Value(time_dim.CumulVar(next_index))
                route.stops.append(
                    StopEstimate(
                        order_id=order.order_id,
                        arrival_s=arrival,
                        departure_s=arrival + order.service_time_s,
                        late_s=max(0, arrival - order.window_end_s),
                    )
                )
                route.load_weight_g += order.weight_g
                route.load_volume_ml += order.volume_ml
                assigned.add(order.order_id)
                if order.order_id in previous and previous[order.order_id] != v:
                    reassigned.append(order.order_id)
            point = node_point(node)
            route.distance_m += matrix.distance_m(previous_point, point)
            previous_point = point
            index = next_index
        end_time = assignment.Value(time_dim.CumulVar(index))
        route.duration_s = end_time - start_time
        route.overtime_s = max(0, end_time - spec.shift_end_s)
        if route.stops:
            routes.append(route)

    dropped = [o.order_id for o in problem.orders if o.order_id not in assigned]
    return SolverOutput(
        status=status,
        routes=routes,
        dropped_order_ids=dropped,
        objective_value=assignment.ObjectiveValue(),
        reassigned_order_ids=reassigned,
    )
