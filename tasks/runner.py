"""
独立进程执行器入口

用于在独立进程中运行执行器，可以部署多个实例实现并行处理

使用方法:
    uv run python -m tasks.runner --db /path/to/tasks.db --type image --api-url ... --api-key ...
"""

import argparse
import signal
import sys
from pathlib import Path

from loguru import logger

from .executor import ImageExecutor, VideoExecutor, AudioExecutor


def setup_logging():
    """配置日志"""
    logger.remove()
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO"
    )


def main():
    parser = argparse.ArgumentParser(description='Task Executor Runner')
    parser.add_argument('--db', required=True, help='Database file path')
    parser.add_argument('--type', required=True, choices=['image', 'video', 'audio', 'all'],
                        help='Task type to process')
    parser.add_argument('--api-url', required=True, help='API URL')
    parser.add_argument('--api-key', required=True, help='API key')
    parser.add_argument('--model', default='', help='Model name')
    parser.add_argument('--worker-id', help='Worker ID (auto-generated if not specified)')
    parser.add_argument('--heartbeat', type=int, default=30, help='Heartbeat interval (seconds)')
    parser.add_argument('--lock-timeout', type=int, default=60, help='Lock timeout (seconds)')
    parser.add_argument('--idle-sleep', type=float, default=1.0, help='Sleep time when idle (seconds)')
    
    args = parser.parse_args()
    
    setup_logging()
    
    # 检查数据库文件
    db_path = Path(args.db)
    if not db_path.exists():
        logger.error(f"Database file not found: {db_path}")
        sys.exit(1)
    
    # 初始化数据库连接（需要先初始化 TaskManager 来创建表）
    from .manager import TaskManager
    TaskManager(str(db_path))
    
    # 创建执行器
    executor_classes = {
        'image': ImageExecutor,
        'video': VideoExecutor,
        'audio': AudioExecutor,
    }
    
    executors = []
    
    if args.type == 'all':
        # 启动所有类型的执行器
        for task_type, executor_class in executor_classes.items():
            executor = executor_class(
                db_path=str(db_path),
                api_url=args.api_url,
                api_key=args.api_key,
                model=args.model,
                worker_id=f"{args.worker_id}-{task_type}" if args.worker_id else None,
                heartbeat_interval=args.heartbeat,
                lock_timeout=args.lock_timeout
            )
            executors.append(executor)
    else:
        # 启动指定类型的执行器
        executor_class = executor_classes[args.type]
        executor = executor_class(
            db_path=str(db_path),
            api_url=args.api_url,
            api_key=args.api_key,
            model=args.model,
            worker_id=args.worker_id,
            heartbeat_interval=args.heartbeat,
            lock_timeout=args.lock_timeout
        )
        executors.append(executor)
    
    # 设置信号处理
    def signal_handler(signum, frame):
        logger.info("Received shutdown signal, stopping executors...")
        for executor in executors:
            executor.stop()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 运行执行器
    if len(executors) == 1:
        # 单个执行器，直接运行
        logger.info(f"Starting {args.type} executor...")
        executors[0].run_loop(idle_sleep=args.idle_sleep)
    else:
        # 多个执行器，使用线程
        import threading
        threads = []
        
        for executor in executors:
            thread = threading.Thread(
                target=executor.run_loop,
                kwargs={'idle_sleep': args.idle_sleep},
                daemon=True
            )
            thread.start()
            threads.append(thread)
            logger.info(f"Started {executor.task_type} executor in thread")
        
        # 等待所有线程
        try:
            for thread in threads:
                thread.join()
        except KeyboardInterrupt:
            logger.info("Interrupted, shutting down...")
            for executor in executors:
                executor.stop()


if __name__ == '__main__':
    main()
