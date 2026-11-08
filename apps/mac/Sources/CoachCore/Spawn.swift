import Darwin
import Foundation

/// A child process with stdin from /dev/null and stdout and stderr on one pipe, in its own
/// process group, inheriting no other open file and no blocked or ignored signal.
struct Spawned {
    let pid: pid_t
    /// The read end of the output pipe; the caller closes it.
    let output: Int32
}

enum SpawnError: Error, CustomStringConvertible {
    case failed(path: String, errno: Int32)
    var description: String {
        switch self {
        case let .failed(path, code): return "\(path): \(String(cString: strerror(code)))"
        }
    }
}

func spawn(_ path: String, _ arguments: [String], environment: [String: String]) throws -> Spawned {
    var fds: [Int32] = [0, 0]
    guard pipe(&fds) == 0 else { throw SpawnError.failed(path: path, errno: errno) }
    defer { close(fds[1]) }

    var actions: posix_spawn_file_actions_t?
    posix_spawn_file_actions_init(&actions)
    defer { posix_spawn_file_actions_destroy(&actions) }
    posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0)
    posix_spawn_file_actions_adddup2(&actions, fds[1], STDOUT_FILENO)
    posix_spawn_file_actions_adddup2(&actions, fds[1], STDERR_FILENO)

    var attributes: posix_spawnattr_t?
    posix_spawnattr_init(&attributes)
    defer { posix_spawnattr_destroy(&attributes) }
    // Its own process group; only the descriptors set above; default signal handling.
    let flags = POSIX_SPAWN_SETPGROUP | POSIX_SPAWN_CLOEXEC_DEFAULT | POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETSIGMASK
    posix_spawnattr_setflags(&attributes, Int16(flags))
    posix_spawnattr_setpgroup(&attributes, 0)
    var all = sigset_t()
    sigfillset(&all)
    posix_spawnattr_setsigdefault(&attributes, &all)
    var none = sigset_t()
    sigemptyset(&none)
    posix_spawnattr_setsigmask(&attributes, &none)

    let argv = ([path] + arguments).map { strdup($0) } + [nil]
    let envp = environment.map { strdup("\($0.key)=\($0.value)") } + [nil]
    defer { (argv + envp).forEach { free($0) } }

    var pid: pid_t = 0
    let result = posix_spawn(&pid, path, &actions, &attributes, argv, envp)
    guard result == 0 else {
        close(fds[0])
        throw SpawnError.failed(path: path, errno: result)
    }
    return Spawned(pid: pid, output: fds[0])
}

/// Every process started by `pid`, children before their own children, found before any is killed.
func descendants(of pid: pid_t) -> [pid_t] {
    let room = 256
    var children = [pid_t](repeating: 0, count: room)
    let count = Int(proc_listchildpids(pid, &children, Int32(room * MemoryLayout<pid_t>.size)))
    guard count > 0 else { return [] }
    let direct = Array(children.prefix(count))
    return direct + direct.flatMap { descendants(of: $0) }
}

/// Blocks until `pid` exits; its exit status.
func waitFor(_ pid: pid_t) -> Int32 {
    var status: Int32 = 0
    while waitpid(pid, &status, 0) == -1 && errno == EINTR {}
    return status
}
